import { parseSubscription } from "@subboost/core/parser";
import { buildSubscriptionResponseHeaders } from "@subboost/server-core/subscription/response-headers";
import pkg from "../package.json";
import { requireAdmin } from "./auth";
import { ApiError, BODY_LIMITS } from "./errors";
import { error, json, readJsonBody, withSecurityHeaders } from "./http";
import { getOrGenerateSubscription, refreshAll, type PipelineDeps } from "./pipeline";
import { resolveDefaultUserAgent } from "./sources";
import { validatePublicHttpUrl } from "./ssrf";
import { createStore } from "./store";
import {
  MAX_MANUAL_TEXT_BYTES,
  MAX_SOURCE_NAME_LENGTH,
  MAX_SOURCES,
  MAX_SUBSCRIPTIONS,
  MAX_USER_AGENT_LENGTH,
  type SourceInput,
} from "./types";

export type RouterDeps = {
  pipeline?: PipelineDeps;
  now?: () => Date;
};

const APP_NAME_FALLBACK = "SubBoost Lite";
const SUBSCRIPTION_NAME_MAX_LENGTH = 80;

function appName(env: Env): string {
  return env.APP_NAME?.trim() || APP_NAME_FALLBACK;
}

function buildPipelineDeps(env: Env, overrides: RouterDeps): PipelineDeps {
  const now = overrides.now ?? (() => new Date());
  return (
    overrides.pipeline ?? {
      store: createStore(env),
      fetchText: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, init);
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          text: await response.text(),
          finalUrl: String(input),
        };
      }) as unknown as PipelineDeps["fetchText"],
      now,
      defaultUserAgent: resolveDefaultUserAgent(env),
    }
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function validateSources(input: unknown): Promise<SourceInput[]> {
  if (!isPlainObject(input) || !Array.isArray(input.sources)) {
    throw new ApiError(400, "VALIDATION_ERROR", "请求体必须包含 sources 数组");
  }
  const raw = input.sources;
  if (raw.length > MAX_SOURCES) {
    throw new ApiError(400, "VALIDATION_ERROR", `最多允许 ${MAX_SOURCES} 个源`);
  }

  const sources: SourceInput[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const prefix = `第 ${index + 1} 个源：`;
    if (!isPlainObject(item)) {
      throw new ApiError(400, "VALIDATION_ERROR", `${prefix}格式不正确`);
    }

    const name = stringField(item.name).trim();
    if (name.length < 1 || name.length > MAX_SOURCE_NAME_LENGTH) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `${prefix}名称长度必须在 1 到 ${MAX_SOURCE_NAME_LENGTH} 字符之间`
      );
    }

    const kind = item.kind;
    if (kind !== "remote" && kind !== "manual") {
      throw new ApiError(400, "VALIDATION_ERROR", `${prefix}类型必须是 remote 或 manual`);
    }

    const userAgent = typeof item.userAgent === "string" ? item.userAgent.trim() : "";
    if (userAgent && (userAgent.length < 1 || userAgent.length > MAX_USER_AGENT_LENGTH)) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `${prefix}User-Agent 长度必须在 1 到 ${MAX_USER_AGENT_LENGTH} 字符之间`
      );
    }

    if (kind === "remote") {
      const url = stringField(item.url).trim();
      const validation = validatePublicHttpUrl(url);
      if (!validation.ok) {
        throw new ApiError(400, "VALIDATION_ERROR", `${prefix}${validation.reason}`);
      }
      sources.push({
        ...(typeof item.id === "string" && item.id ? { id: item.id } : {}),
        name,
        kind,
        url,
        enabled: item.enabled !== false,
        ...(userAgent ? { userAgent } : {}),
      });
      continue;
    }

    const manualText = stringField(item.manualText);
    if (new TextEncoder().encode(manualText).byteLength > MAX_MANUAL_TEXT_BYTES) {
      throw new ApiError(400, "VALIDATION_ERROR", `${prefix}手动节点文本超过 512 KiB`);
    }
    let parsed;
    try {
      parsed = parseSubscription(manualText);
    } catch (err) {
      const errorName = err instanceof Error ? err.name : "Error";
      throw new ApiError(400, "VALIDATION_ERROR", `${prefix}解析失败: ${errorName}`);
    }
    if (parsed.nodes.length === 0) {
      const summary = parsed.errors.slice(0, 3).join("；") || "未解析到任何节点";
      throw new ApiError(400, "VALIDATION_ERROR", `${prefix}${summary}`);
    }
    sources.push({
      ...(typeof item.id === "string" && item.id ? { id: item.id } : {}),
      name,
      kind,
      manualText,
      enabled: item.enabled !== false,
      ...(userAgent ? { userAgent } : {}),
    });
  }

  return sources;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "请求体必须是 JSON 对象");
  }
  return body;
}

async function handleApi(request: Request, env: Env, deps: RouterDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const pipelineDeps = buildPipelineDeps(env, deps);
  const store = pipelineDeps.store;

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true });
  }

  await requireAdmin(request, env);

  if (path === "/api/state" && method === "GET") {
    const [{ config, isDefault }, sources, subscriptions, status] = await Promise.all([
      store.getConfig(),
      store.listSources(),
      store.listSubscriptions(url.origin),
      store.getStatus(),
    ]);
    return json({
      app: { name: appName(env), version: pkg.version },
      sources,
      subscriptions,
      config,
      configIsDefault: isDefault,
      status,
    });
  }

  if (path === "/api/sources" && method === "PUT") {
    const body = await readJsonBody(request, BODY_LIMITS.large);
    const inputs = await validateSources(body);
    const sources = await store.saveSources(inputs);
    return json({ sources });
  }

  if (path === "/api/config" && method === "PUT") {
    const body = await readJsonBody(request, BODY_LIMITS.large);
    const config = requireObjectBody(body);
    await store.putConfig(config);
    return json({ config, configIsDefault: false });
  }

  if (path === "/api/config" && method === "DELETE") {
    await store.resetConfig();
    const { config } = await store.getConfig();
    return json({ config, configIsDefault: true });
  }

  if (path === "/api/subscriptions" && method === "POST") {
    const body = requireObjectBody(await readJsonBody(request, BODY_LIMITS.small));
    const name = stringField(body.name).trim();
    if (name.length < 1 || name.length > SUBSCRIPTION_NAME_MAX_LENGTH) {
      throw new ApiError(400, "VALIDATION_ERROR", "订阅名称长度必须在 1 到 80 字符之间");
    }
    const rawSourceIds = body.sourceIds;
    if (rawSourceIds !== undefined && !Array.isArray(rawSourceIds)) {
      throw new ApiError(400, "VALIDATION_ERROR", "sourceIds 必须是数组");
    }
    const sourceIds = Array.isArray(rawSourceIds)
      ? rawSourceIds.filter((value): value is string => typeof value === "string")
      : [];

    const existing = await store.listStoredSubscriptions();
    if (existing.length >= MAX_SUBSCRIPTIONS) {
      throw new ApiError(400, "VALIDATION_ERROR", `最多允许 ${MAX_SUBSCRIPTIONS} 条订阅`);
    }

    const { dto, token } = await store.createSubscription({ name, sourceIds });
    // 用本次创建的 token 组装链接，避免多订阅时误取列表首项
    return json({ subscription: { ...dto, link: `${url.origin}/sub/${token}` } }, 201);
  }

  const rotateMatch = /^\/api\/subscriptions\/([^/]+)\/rotate$/.exec(path);
  if (rotateMatch && method === "POST") {
    const subscription = await store.rotateSubscriptionToken(
      decodeURIComponent(rotateMatch[1]),
      url.origin
    );
    if (!subscription) throw new ApiError(404, "NOT_FOUND", "订阅不存在");
    return json({ subscription });
  }

  const deleteMatch = /^\/api\/subscriptions\/([^/]+)$/.exec(path);
  if (deleteMatch && method === "DELETE") {
    const deleted = await store.deleteSubscription(decodeURIComponent(deleteMatch[1]));
    if (!deleted) throw new ApiError(404, "NOT_FOUND", "订阅不存在");
    return withSecurityHeaders(new Response(null, { status: 204 }));
  }

  if (path === "/api/refresh" && method === "POST") {
    const result = await refreshAll(pipelineDeps, { trigger: "manual" });
    if ("skipped" in result) {
      throw new ApiError(409, "REFRESH_IN_PROGRESS", "刷新进行中");
    }
    return json({ status: result.status });
  }

  if (path.startsWith("/api/")) {
    throw new ApiError(404, "NOT_FOUND", "接口不存在");
  }

  throw new ApiError(404, "NOT_FOUND", "接口不存在");
}

function textResponse(
  body: string,
  status: number,
  extraHeaders?: Record<string, string>,
  omitBody = false
): Response {
  const headers = new Headers({
    "content-type": "text/plain;charset=utf-8",
    ...extraHeaders,
  });
  return withSecurityHeaders(new Response(omitBody ? null : body, { status, headers }));
}

async function handleSubscription(
  request: Request,
  env: Env,
  deps: RouterDeps,
  token: string
): Promise<Response> {
  const pipelineDeps = buildPipelineDeps(env, deps);
  const isHead = request.method.toUpperCase() === "HEAD";

  let result;
  try {
    result = await getOrGenerateSubscription(pipelineDeps, token);
  } catch {
    // /sub/* 的非 200 响应体一律为纯文本，不使用 JSON 错误体
    return textResponse("Internal error", 500, undefined, isHead);
  }

  if (result.kind === "not-found") {
    return textResponse("Not found", 404, undefined, isHead);
  }
  if (result.kind === "no-nodes") {
    return textResponse("No nodes available", 503, { "Retry-After": "600" }, isHead);
  }

  const headers = buildSubscriptionResponseHeaders(result.sub.name, result.info ?? {}, {
    cacheControl: "no-store",
    cacheExpirySeconds: 43200,
    autoUpdateIntervalSeconds: 43200,
    isAdmin: false,
  });
  headers["x-content-type-options"] = "nosniff";
  headers["x-robots-tag"] = "noindex";
  headers["cache-control"] = "no-store";
  const response = new Response(isHead ? null : result.cache.yaml, { status: 200, headers });
  return withSecurityHeaders(response);
}

export async function route(
  request: Request,
  env: Env,
  deps: RouterDeps = {}
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path.startsWith("/sub/")) {
      let token: string;
      try {
        token = decodeURIComponent(path.slice("/sub/".length));
      } catch {
        return textResponse("Not found", 404, undefined, request.method.toUpperCase() === "HEAD");
      }
      if (!token || token.includes("/")) {
        return textResponse("Not found", 404, undefined, request.method.toUpperCase() === "HEAD");
      }
      return await handleSubscription(request, env, deps, token);
    }

    if (path.startsWith("/api/")) {
      return await handleApi(request, env, deps);
    }

    return await env.ASSETS.fetch(request);
  } catch (err) {
    if (err instanceof ApiError) return error(err);
    console.error("unhandled route error", err instanceof Error ? err.name : "Error");
    return error(new ApiError(500, "INTERNAL_ERROR", "Internal error"));
  }
}



