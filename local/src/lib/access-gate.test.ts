import { afterEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  ACCESS_GATE_COOKIE,
  ACCESS_TOKEN_ENV_NAME,
  ACCESS_TOKEN_QUERY_PARAM,
  buildAccessGateApiErrorBody,
  buildAccessGateHtmlPage,
  getAccessGateToken,
  isAccessGateApiPath,
  isAccessGateExemptPath,
  issueAccessGateCookieToken,
  matchesAccessToken,
  verifyAccessGateCookieToken,
} from "./access-gate";

describe("access gate token configuration", () => {
  const originalToken = process.env[ACCESS_TOKEN_ENV_NAME];
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalToken === undefined) delete process.env[ACCESS_TOKEN_ENV_NAME];
    else process.env[ACCESS_TOKEN_ENV_NAME] = originalToken;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it("disables the gate when ACCESS_TOKEN is unset or blank", () => {
    delete process.env[ACCESS_TOKEN_ENV_NAME];
    expect(getAccessGateToken()).toBeNull();
    process.env[ACCESS_TOKEN_ENV_NAME] = "   ";
    expect(getAccessGateToken()).toBeNull();
  });

  it("returns the trimmed token when configured", () => {
    process.env[ACCESS_TOKEN_ENV_NAME] = "  expected-access-token  ";
    expect(getAccessGateToken()).toBe("expected-access-token");
  });

  it("accepts only the exact access token", async () => {
    process.env.JWT_SECRET = "access-gate-test-jwt-secret";
    process.env[ACCESS_TOKEN_ENV_NAME] = "expected-access-token";
    expect(await matchesAccessToken("expected-access-token", "expected-access-token")).toBe(true);
    expect(await matchesAccessToken("expected-access-tokens", "expected-access-token")).toBe(false);
    expect(await matchesAccessToken("", "expected-access-token")).toBe(false);
    expect(await matchesAccessToken("expected-access-token", "")).toBe(false);
  });
});

describe("access gate cookie", () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it("round-trips an issued gate cookie", async () => {
    process.env.JWT_SECRET = "access-gate-test-jwt-secret";
    const token = await issueAccessGateCookieToken();
    expect(typeof token).toBe("string");
    expect(await verifyAccessGateCookieToken(token)).toBe(true);
  });

  it("rejects malformed gate cookies", async () => {
    process.env.JWT_SECRET = "access-gate-test-jwt-secret";
    expect(await verifyAccessGateCookieToken("")).toBe(false);
    expect(await verifyAccessGateCookieToken("not-a-jwt")).toBe(false);
  });

  it("rejects admin session tokens signed with the same secret", async () => {
    process.env.JWT_SECRET = "access-gate-test-jwt-secret";
    const sessionLikeToken = await new SignJWT({ username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-id")
      .setIssuer("subboost-local")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifyAccessGateCookieToken(sessionLikeToken)).toBe(false);
  });
});

describe("access gate path policy", () => {
  it("exempts subscription delivery, health probes and cron endpoints", () => {
    expect(isAccessGateExemptPath("/api/subscriptions/token-1/config.yaml")).toBe(true);
    expect(isAccessGateExemptPath("/api/subscriptions/a%2Fb/config.yaml")).toBe(true);
    expect(isAccessGateExemptPath("/api/health/live")).toBe(true);
    expect(isAccessGateExemptPath("/api/health/ready")).toBe(true);
    expect(isAccessGateExemptPath("/api/cron/update-subscriptions")).toBe(true);
  });

  it("keeps admin APIs and pages behind the gate", () => {
    expect(isAccessGateExemptPath("/api/subscriptions/token-1")).toBe(false);
    expect(isAccessGateExemptPath("/api/subscriptions/token-1/refresh")).toBe(false);
    expect(isAccessGateExemptPath("/api/auth/login")).toBe(false);
    expect(isAccessGateExemptPath("/api/subscriptions")).toBe(false);
    expect(isAccessGateExemptPath("/dashboard")).toBe(false);
    expect(isAccessGateExemptPath("/")).toBe(false);
  });

  it("classifies API paths correctly", () => {
    expect(isAccessGateApiPath("/api")).toBe(true);
    expect(isAccessGateApiPath("/api/auth/login")).toBe(true);
    expect(isAccessGateApiPath("/dashboard")).toBe(false);
    expect(isAccessGateApiPath("/")).toBe(false);
  });
});

describe("access gate responses", () => {
  it("renders a self-contained gate page that posts to the current path", () => {
    const html = buildAccessGateHtmlPage("/dashboard");
    expect(html).toContain('<form method="get" action="/dashboard"');
    expect(html).toContain(`name="${ACCESS_TOKEN_QUERY_PARAM}"`);
    expect(html).toContain("noindex, nofollow");
  });

  it("escapes the form action path", () => {
    const html = buildAccessGateHtmlPage('/x"><script>');
    expect(html).not.toContain('action="/x"><script>');
    expect(html).toContain('action="/x&quot;&gt;&lt;script&gt;');
  });

  it("builds a plain API error body", () => {
    expect(buildAccessGateApiErrorBody()).toEqual({
      error: "Access token required.",
      code: "UNAUTHORIZED",
    });
  });
});

describe("access gate cookie name", () => {
  it("does not collide with the admin session cookie", () => {
    expect(ACCESS_GATE_COOKIE).toBe("subboost_access_gate");
    expect(ACCESS_GATE_COOKIE).not.toBe("subboost_local_session");
  });
});
