import { jwtVerify, SignJWT } from "jose";
import { isHttpsAppUrl, requireEnv } from "./env";

/**
 * 站点级访问令牌门禁(ACCESS_TOKEN)。
 *
 * 设计约束:
 * - 仅依赖 WebCrypto 与 jose,可在 Next.js proxy(nodejs runtime)与
 *   Cloudflare Workers(nodejs_compat)下运行;
 * - 令牌比对使用 HMAC-SHA256 摘要 + 恒定时间比较,避免时序侧信道;
 * - 未配置 ACCESS_TOKEN 时门禁整体关闭,行为与历史版本一致;
 * - 门禁 JWT 复用 JWT_SECRET 签名,但 iss 与管理会话隔离,互不通用。
 */

export const ACCESS_TOKEN_ENV_NAME = "ACCESS_TOKEN";
export const ACCESS_TOKEN_HEADER = "x-access-token";
export const ACCESS_TOKEN_QUERY_PARAM = "access_token";
export const ACCESS_GATE_COOKIE = "subboost_access_gate";

const ACCESS_GATE_ISSUER = "subboost-access-gate";
const ACCESS_GATE_SUBJECT = "access-gate";
const ACCESS_GATE_HMAC_NAMESPACE = "subboost:access-gate:hmac";
const ACCESS_GATE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * 无需门禁的路径:
 * - `/api/subscriptions/{token}/config.yaml`:订阅投递,自带随机 cuid 令牌与限流,
 *   Clash 客户端无 cookie,必须放行;
 * - `/api/health/*`:探活;
 * - `/api/cron/*`:已有 Bearer CRON_SECRET 强凭证。
 */
const ACCESS_GATE_EXEMPT_PATTERNS: readonly RegExp[] = [
  /^\/api\/subscriptions\/[^/]+\/config\.yaml$/,
  /^\/api\/health\/(?:live|ready)$/,
  /^\/api\/cron\//,
];

export function getAccessGateToken(): string | null {
  const value = process.env[ACCESS_TOKEN_ENV_NAME];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAccessGateExemptPath(pathname: string): boolean {
  return ACCESS_GATE_EXEMPT_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isAccessGateApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message))
  );
}

async function accessGateHmacKey(): Promise<string> {
  return `${ACCESS_GATE_HMAC_NAMESPACE}:${requireEnv("JWT_SECRET")}`;
}

/** 恒定时间比较访问令牌;空令牌直接拒绝。 */
export async function matchesAccessToken(presented: string, expected: string): Promise<boolean> {
  const normalized = presented.trim();
  if (!normalized || !expected) return false;
  const key = await accessGateHmacKey();
  const [presentedDigest, expectedDigest] = await Promise.all([
    hmacSha256(key, normalized),
    hmacSha256(key, expected),
  ]);
  return timingSafeEqualBytes(presentedDigest, expectedDigest);
}

async function accessGateSigningKey(): Promise<Uint8Array> {
  return new TextEncoder().encode(requireEnv("JWT_SECRET"));
}

export async function issueAccessGateCookieToken(): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ACCESS_GATE_SUBJECT)
    .setIssuer(ACCESS_GATE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_GATE_COOKIE_TTL_SECONDS}s`)
    .sign(await accessGateSigningKey());
}

export async function verifyAccessGateCookieToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, await accessGateSigningKey(), {
      algorithms: ["HS256"],
    });
    if (payload.iss !== ACCESS_GATE_ISSUER) return false;
    return payload.sub === ACCESS_GATE_SUBJECT;
  } catch {
    return false;
  }
}

export function accessGateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: ACCESS_GATE_COOKIE_TTL_SECONDS,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 无凭证访问页面时返回的极简门禁页。
 * 表单以 GET 提交到当前路径,token 进入 query 后由 proxy 校验并换取 cookie。
 */
export function buildAccessGateHtmlPage(pathname: string): string {
  const action = escapeHtmlAttribute(pathname.startsWith("/") ? pathname : "/");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>访问验证 - SubBoost</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0d10; color: #e6e8eb;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  main {
    width: 100%; max-width: 360px;
    background: #14181d; border: 1px solid #232a31; border-radius: 12px;
    padding: 32px 28px;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
  p { font-size: 13px; line-height: 1.6; color: #9aa4ae; margin-bottom: 20px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  input {
    height: 40px; padding: 0 12px; border-radius: 8px;
    border: 1px solid #2c343d; background: #0e1115; color: #e6e8eb;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: #4a90d9; }
  button {
    height: 40px; border: none; border-radius: 8px; cursor: pointer;
    background: #2563eb; color: #fff; font-size: 14px; font-weight: 500;
  }
  button:hover { background: #1d4fd7; }
  button:focus-visible, input:focus-visible { outline: 2px solid #4a90d9; outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <h1>SubBoost</h1>
  <p>此部署已启用访问令牌验证,请输入访问令牌继续。</p>
  <form method="get" action="${action}">
    <input type="password" name="${ACCESS_TOKEN_QUERY_PARAM}" placeholder="访问令牌" autocomplete="off" autofocus aria-label="访问令牌">
    <button type="submit">验证</button>
  </form>
</main>
</body>
</html>`;
}

export function buildAccessGateApiErrorBody(): { error: string; code: string } {
  return { error: "Access token required.", code: "UNAUTHORIZED" };
}
