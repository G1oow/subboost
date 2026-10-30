#!/usr/bin/env node
/**
 * 版本号同步与校验。
 *
 * 版本号的单一来源是根 package.json 的 version。worker 运行时通过
 * `import pkg from "../package.json"` 读到 worker/package.json 的 version，
 * 管理端页头显示的 vX.Y.Z 也来自同一处，所以各 workspace 的版本必须一致，
 * 否则页头、/api/state、README 徽章会互相矛盾。
 *
 * 用法：
 *   node scripts/check-version.cjs                 只校验，不一致则以 1 退出
 *   node scripts/check-version.cjs --set 0.2.0     把 0.2.0 同步写入所有位置
 *   node scripts/check-version.cjs --set 0.2.0 --dry-run  只打印将要改动的文件
 *
 * 需要同步的位置见 PACKAGE_FILES / TEXT_TARGETS / TEST_FILES。测试里断言了具体版本号，
 * 改版本时必须一起改，否则 npm run test:unit 会红。
 */
const { readFileSync, writeFileSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const workspaceRoot = resolve(__dirname, "..");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** 必须与根 package.json 保持同一版本的文件 */
const PACKAGE_FILES = [
  "package.json",
  "worker/package.json",
  "packages/core/package.json",
  "packages/server-core/package.json",
  "packages/ui/package.json",
];

/** 文档里写死版本号的地方：用回调只替换版本本身，保留其余文本 */
const TEXT_TARGETS = [
  {
    file: "README.md",
    // 徽章形如 badge/version-0.1.0-green.svg，版本后面紧跟 -green
    pattern: /(badge\/version-)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?=-)/g,
    label: "README 徽章",
  },
  {
    file: "README.md",
    pattern: /(alt="Version )(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g,
    label: "README 徽章 alt",
  },
];

/** 测试里断言具体版本号，改版本时必须同步，否则测试会红 */
const TEST_FILES = [
  {
    file: "worker/src/router.test.ts",
    pattern: /(version: ")(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(")/g,
  },
  {
    file: "worker/ui/src/components/render.test.ts",
    pattern: /(version: ")(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(")/g,
  },
  {
    file: "worker/ui/src/components/render.test.ts",
    pattern: /(toContain\("v)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)("\))/g,
  },
];

function readJson(relPath) {
  return JSON.parse(readFileSync(join(workspaceRoot, relPath), "utf8"));
}

function readText(relPath) {
  return readFileSync(join(workspaceRoot, relPath), "utf8");
}

/** 收集当前所有位置的版本，用于校验与展示差异 */
function collectVersions() {
  const findings = [];
  for (const relPath of PACKAGE_FILES) {
    findings.push({ file: relPath, label: "package.json", version: readJson(relPath).version });
  }
  for (const target of TEXT_TARGETS) {
    const text = readText(target.file);
    for (const match of text.matchAll(target.pattern)) {
      findings.push({ file: target.file, label: target.label, version: match[2] });
    }
  }
  return findings;
}

function check() {
  const rootVersion = readJson("package.json").version;
  const findings = collectVersions();
  const mismatched = findings.filter((item) => item.version !== rootVersion);

  if (!SEMVER.test(rootVersion)) {
    console.error(`根 package.json 的 version "${rootVersion}" 不是合法 semver。`);
    return 1;
  }

  if (mismatched.length > 0) {
    console.error(`版本不一致，基准是 package.json 的 ${rootVersion}：`);
    for (const item of mismatched) {
      console.error(`  ${item.file} (${item.label}): ${item.version}`);
    }
    console.error("\n修复：node scripts/check-version.cjs --set <version>");
    return 1;
  }

  console.log(`版本一致：${rootVersion}（检查了 ${findings.length} 处）。`);
  return 0;
}

function setVersion(nextVersion, dryRun) {
  if (!SEMVER.test(nextVersion)) {
    console.error(`"${nextVersion}" 不是合法 semver（形如 1.2.3 或 1.2.3-beta.1）。`);
    return 1;
  }

  const changed = [];

  // 1. 各 package.json：走 JSON 解析再写回，保证格式稳定、不会误伤字符串里的同形数字
  for (const relPath of PACKAGE_FILES) {
    const absPath = join(workspaceRoot, relPath);
    const raw = readFileSync(absPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.version === nextVersion) continue;

    // 只替换 version 字段所在行，保留原文件的缩进与键顺序
    const updated = raw.replace(/("version"\s*:\s*")([^"]*)(")/u, `$1${nextVersion}$3`);
    if (updated === raw) {
      changed.push({ file: relPath, from: parsed.version, to: nextVersion, skipped: "未找到 version 字段" });
      continue;
    }
    changed.push({ file: relPath, from: parsed.version, to: nextVersion });
    if (!dryRun) writeFileSync(absPath, updated, "utf8");
  }

  // 2. 文档与测试里的字面量
  for (const target of [...TEXT_TARGETS, ...TEST_FILES]) {
    const absPath = join(workspaceRoot, target.file);
    const raw = readFileSync(absPath, "utf8");
    let touched = false;
    // 只替换第 2 个捕获组（版本号本身），其余文本原样保留。
    // 用位置而非固定参数名，兼容带/不带 lookahead 的各条正则。
    const updated = raw.replace(target.pattern, (whole, ...rest) => {
      const group2 = rest[1];
      if (group2 === nextVersion) return whole;
      touched = true;
      return whole.replace(group2, nextVersion);
    });
    if (touched) {
      changed.push({ file: target.file, from: "旧版本字面量", to: nextVersion });
      if (!dryRun) writeFileSync(absPath, updated, "utf8");
    }
  }

  if (changed.length === 0) {
    console.log(`全部位置已经是 ${nextVersion}，无需改动。`);
    return 0;
  }

  console.log(`${dryRun ? "[dry-run] 将" : ""}同步版本到 ${nextVersion}：`);
  for (const item of changed) {
    const note = item.skipped ? `（${item.skipped}）` : "";
    console.log(`  ${relative(workspaceRoot, join(workspaceRoot, item.file))}: ${item.from} -> ${item.to}${note}`);
  }
  if (!dryRun) console.log("\n记得同步更新 CHANGELOG（如果存在）并重跑 npm run test:unit。");
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  const setIndex = args.indexOf("--set");
  const dryRun = args.includes("--dry-run");

  if (setIndex >= 0) {
    const nextVersion = args[setIndex + 1];
    if (!nextVersion) {
      console.error("用法：node scripts/check-version.cjs --set <version> [--dry-run]");
      return 1;
    }
    return setVersion(nextVersion, dryRun);
  }

  return check();
}

process.exit(main());
