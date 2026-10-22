/**
 * 扩展脚本（Clash Verge Rev 风格 `main(config)` 脚本）的输入校验与命名工具。
 *
 * Workers 里不执行用户脚本，这里只做结构与体积校验：脚本原文原样保存，
 * 由客户端在导入后自行执行。
 */

import { generateToken } from "./crypto";
import { ApiError } from "./errors";
import {
  MAX_SCRIPT_BYTES,
  MAX_SCRIPT_DESCRIPTION_LENGTH,
  MAX_SCRIPT_NAME_LENGTH,
  type ExtensionScriptInput,
  type ExtensionScriptPatch,
} from "./types";

/** 扩展脚本入口约定：`function main(config)`、`const main = ...` 或 `main: (config) => ...` */
const MAIN_ENTRY_PATTERNS = [
  /(?:^|[^\w$.])function\s+main\s*\(/,
  /(?:^|[^\w$.])(?:const|let|var)\s+main\s*=/,
  /(?:^|[^\w$.])main\s*[:=]\s*(?:async\s*)?(?:function\b|\()/,
];

/** 分享码固定为 base64url 字符集，长度限定避免把任意路径当分享码处理 */
const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** 下载文件名里只保留安全字符 */
const UNSAFE_FILE_NAME_CHARS = /[^A-Za-z0-9._-]+/g;

export function scriptByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

/** 是否包含 `main` 入口，用来挡住误传的普通文本或片段 */
export function hasExtensionScriptMain(content: string): boolean {
  return MAIN_ENTRY_PATTERNS.some((pattern) => pattern.test(content));
}

export function normalizeScriptName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > MAX_SCRIPT_NAME_LENGTH) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `脚本名称长度必须在 1 到 ${MAX_SCRIPT_NAME_LENGTH} 字符之间`
    );
  }
  return name;
}

export function normalizeScriptDescription(value: unknown): string {
  const description = typeof value === "string" ? value.trim() : "";
  if (description.length > MAX_SCRIPT_DESCRIPTION_LENGTH) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `脚本描述不能超过 ${MAX_SCRIPT_DESCRIPTION_LENGTH} 字符`
    );
  }
  return description;
}

export function normalizeScriptContent(value: unknown): string {
  const content = typeof value === "string" ? value : "";
  if (!content.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "脚本内容不能为空");
  }
  if (scriptByteLength(content) > MAX_SCRIPT_BYTES) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `脚本内容超过 ${Math.floor(MAX_SCRIPT_BYTES / 1024)} KiB 上限`
    );
  }
  if (!hasExtensionScriptMain(content)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "脚本缺少 main(config) 入口，请确认导入的是 Clash Verge Rev 扩展脚本"
    );
  }
  return content;
}

export function parseScriptCreateInput(body: Record<string, unknown>): ExtensionScriptInput {
  const description = normalizeScriptDescription(body.description);
  return {
    name: normalizeScriptName(body.name),
    ...(description ? { description } : {}),
    content: normalizeScriptContent(body.content),
    enabled: body.enabled !== false,
  };
}

/** 只校验请求体里出现的字段，未出现的保持原值 */
export function parseScriptPatch(body: Record<string, unknown>): ExtensionScriptPatch {
  const patch: ExtensionScriptPatch = {};
  if (body.name !== undefined) patch.name = normalizeScriptName(body.name);
  if (body.description !== undefined) {
    // 空字符串表示清空描述
    patch.description = normalizeScriptDescription(body.description);
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      throw new ApiError(400, "VALIDATION_ERROR", "enabled 必须是布尔值");
    }
    patch.enabled = body.enabled;
  }
  if (body.content !== undefined) patch.content = normalizeScriptContent(body.content);
  return patch;
}

/** 生成不可猜测的分享码（256 bit 随机，base64url） */
export function newScriptShareCode(): string {
  return generateToken();
}

/** 校验路径里的分享码；格式不符时返回 null，避免无谓的 KV 读取 */
export function normalizeShareCode(value: string): string | null {
  return SHARE_CODE_PATTERN.test(value) ? value : null;
}

/** 分享链接下载时的文件名，例如「我的规则.js」→「我的规则.js」 */
export function scriptDownloadFileName(name: string): string {
  const base = name
    .trim()
    .replace(UNSAFE_FILE_NAME_CHARS, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  const safe = base || "extension-script";
  return safe.toLowerCase().endsWith(".js") ? safe : `${safe}.js`;
}
