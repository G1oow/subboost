import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

function findGitBashBin(): string | null {
  const candidates = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Git", "bin"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Git", "bin"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Git", "bin"),
    process.env.USERPROFILE && join(process.env.USERPROFILE, "scoop", "apps", "git", "current", "bin"),
    // 兜底:扫描 PATH 中的目录,兼容自定义安装路径(如 D:\Git\bin)。
    ...(process.env.PATH || "").split(delimiter).filter(Boolean),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((directory) => existsSync(join(directory, "bash.exe"))) || null;
}

if (process.platform === "win32") {
  const gitBashBin = findGitBashBin();
  if (!gitBashBin) {
    throw new Error("Git for Windows Bash is required to run SubBoost shell-script tests on Windows.");
  }
  process.env.PATH = `${gitBashBin}${delimiter}${process.env.PATH || ""}`;
}
