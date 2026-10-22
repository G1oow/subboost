import { buildDefaultUserConfig } from "@subboost/core/config/defaults";
import { decryptString, encryptString, generateToken, sha256Hex } from "./crypto";
import { ApiError } from "./errors";
import { newScriptShareCode, scriptByteLength } from "./scripts";
import {
  KEY_CONFIG,
  KEY_LOCK,
  KEY_SCRIPTS,
  KEY_SOURCES,
  KEY_STATUS,
  KEY_SUBS,
  MAX_SCRIPTS,
  TTL_CACHE,
  TTL_LOCK,
  TTL_SNAPSHOT,
  type CacheRecord,
  type ExtensionScriptDto,
  type ExtensionScriptInput,
  type ExtensionScriptPatch,
  type SnapshotRecord,
  type SourceDto,
  type SourceInput,
  type StatusRecord,
  type StoredExtensionScript,
  type StoredSource,
  type StoredSubscription,
  type SubscriptionDto,
} from "./types";

export function tokenIndexKey(tokenHash: string): string {
  return `tokidx:${tokenHash}`;
}

export function snapshotKey(sourceId: string): string {
  return `nodes:${sourceId}`;
}

export function cacheKey(subscriptionId: string): string {
  return `cache:${subscriptionId}`;
}

export function scriptContentKey(scriptId: string): string {
  return `script:${scriptId}`;
}

function randomId(): string {
  return generateToken().slice(0, 22);
}

function requireEncryptionKey(env: Env): string {
  const secret = env.ENCRYPTION_KEY?.trim();
  if (!secret) throw new ApiError(503, "CONFIGURATION_ERROR", "ENCRYPTION_KEY 未配置");
  return secret;
}

async function readJsonArray<T>(kv: KVNamespace, key: string): Promise<T[]> {
  const value = await kv.get(key, "json");
  return Array.isArray(value) ? (value as T[]) : [];
}

async function readJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const value = await kv.get(key, "json");
  return value === null || value === undefined ? null : (value as T);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createStore(env: Env) {
  const kv = env.SUBBOOST_KV;

  async function listStoredSources(): Promise<StoredSource[]> {
    return readJsonArray<StoredSource>(kv, KEY_SOURCES);
  }

  async function toSourceDto(stored: StoredSource): Promise<SourceDto> {
    const secret = requireEncryptionKey(env);
    let payload: string;
    try {
      payload = await decryptString(stored.payloadEnc, secret);
    } catch {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "源数据解密失败，请重新录入源（ENCRYPTION_KEY 可能已更换）"
      );
    }
    return {
      id: stored.id,
      name: stored.name,
      kind: stored.kind,
      ...(stored.kind === "remote" ? { url: payload } : { manualText: payload }),
      enabled: stored.enabled,
      ...(stored.userAgent ? { userAgent: stored.userAgent } : {}),
      ...(stored.nodeRenames && Object.keys(stored.nodeRenames).length > 0
        ? { nodeRenames: stored.nodeRenames }
        : {}),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  async function listSources(): Promise<SourceDto[]> {
    // 即使当前没有源也校验密钥，保证未配置密钥时 fail closed
    requireEncryptionKey(env);
    const stored = await listStoredSources();
    return Promise.all(stored.map((item) => toSourceDto(item)));
  }

  async function saveSources(inputs: SourceInput[]): Promise<SourceDto[]> {
    const secret = requireEncryptionKey(env);
    const existing = await listStoredSources();
    const existingById = new Map(existing.map((item) => [item.id, item]));
    const now = new Date().toISOString();
    const nextIds = new Set<string>();

    const stored: StoredSource[] = [];
    for (const input of inputs) {
      const previous = existingById.get(input.id ?? "");
      const id = previous?.id ?? randomId();
      nextIds.add(id);
      const payload = input.kind === "remote" ? input.url ?? "" : input.manualText ?? "";
      const nodeRenames =
        input.nodeRenames && Object.keys(input.nodeRenames).length > 0 ? input.nodeRenames : undefined;
      stored.push({
        id,
        name: input.name,
        kind: input.kind,
        payloadEnc: await encryptString(payload, secret),
        enabled: input.enabled ?? true,
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(nodeRenames ? { nodeRenames } : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      });
    }

    await kv.put(KEY_SOURCES, JSON.stringify(stored));

    // 删除已移除源的快照（尽力而为，失败不影响保存结果）
    for (const item of existing) {
      if (nextIds.has(item.id)) continue;
      try {
        await kv.delete(snapshotKey(item.id));
      } catch {
        // ignore
      }
    }

    // 源集合或节点改名都会影响已生成的 YAML：清掉订阅缓存，下次访问重新生成
    const subs = await listStoredSubscriptions();
    for (const sub of subs) {
      try {
        await kv.delete(cacheKey(sub.id));
      } catch {
        // ignore
      }
    }

    return Promise.all(stored.map((item) => toSourceDto(item)));
  }

  async function listStoredSubscriptions(): Promise<StoredSubscription[]> {
    return readJsonArray<StoredSubscription>(kv, KEY_SUBS);
  }

  async function toSubscriptionDto(
    stored: StoredSubscription,
    origin: string
  ): Promise<SubscriptionDto> {
    const secret = requireEncryptionKey(env);
    let token: string;
    try {
      token = await decryptString(stored.tokenEnc, secret);
    } catch {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "订阅数据解密失败，请重新创建订阅（ENCRYPTION_KEY 可能已更换）"
      );
    }
    return {
      id: stored.id,
      name: stored.name,
      sourceIds: stored.sourceIds,
      link: `${origin}/sub/${token}`,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  async function listSubscriptions(origin: string): Promise<SubscriptionDto[]> {
    requireEncryptionKey(env);
    const stored = await listStoredSubscriptions();
    return Promise.all(stored.map((item) => toSubscriptionDto(item, origin)));
  }

  async function writeSubscriptions(subs: StoredSubscription[]): Promise<void> {
    await kv.put(KEY_SUBS, JSON.stringify(subs));
  }

  async function createSubscription(input: {
    name: string;
    sourceIds: string[];
  }): Promise<{ dto: SubscriptionDto; token: string }> {
    const secret = requireEncryptionKey(env);
    const subs = await listStoredSubscriptions();
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const now = new Date().toISOString();
    const stored: StoredSubscription = {
      id: randomId(),
      name: input.name,
      tokenHash,
      tokenEnc: await encryptString(token, secret),
      sourceIds: input.sourceIds,
      createdAt: now,
      updatedAt: now,
    };
    subs.push(stored);
    await writeSubscriptions(subs);
    await kv.put(tokenIndexKey(tokenHash), stored.id);
    return { dto: await toSubscriptionDto(stored, ""), token };
  }

  async function deleteSubscription(id: string): Promise<boolean> {
    const subs = await listStoredSubscriptions();
    const target = subs.find((item) => item.id === id);
    if (!target) return false;
    await writeSubscriptions(subs.filter((item) => item.id !== id));
    await kv.delete(tokenIndexKey(target.tokenHash));
    await kv.delete(cacheKey(id));
    return true;
  }

  async function rotateSubscriptionToken(
    id: string,
    origin: string
  ): Promise<SubscriptionDto | null> {
    const secret = requireEncryptionKey(env);
    const subs = await listStoredSubscriptions();
    const index = subs.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const previous = subs[index];
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const updated: StoredSubscription = {
      ...previous,
      tokenHash,
      tokenEnc: await encryptString(token, secret),
      updatedAt: new Date().toISOString(),
    };
    subs[index] = updated;
    await writeSubscriptions(subs);
    await kv.delete(tokenIndexKey(previous.tokenHash));
    await kv.put(tokenIndexKey(tokenHash), updated.id);
    return toSubscriptionDto(updated, origin);
  }

  /**
   * 更新订阅的名称与所含源。链接与 token 保持不变，
   * 但源集合变化会改变生成的 YAML，因此必须清掉该订阅的缓存。
   */
  async function updateSubscription(
    id: string,
    patch: { name?: string; sourceIds?: string[] },
    origin: string
  ): Promise<SubscriptionDto | null> {
    const subs = await listStoredSubscriptions();
    const index = subs.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const previous = subs[index];
    const updated: StoredSubscription = {
      ...previous,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.sourceIds !== undefined ? { sourceIds: patch.sourceIds } : {}),
      updatedAt: new Date().toISOString(),
    };
    subs[index] = updated;
    await writeSubscriptions(subs);
    await kv.delete(cacheKey(id));
    return toSubscriptionDto(updated, origin);
  }

  async function findSubscriptionByToken(token: string): Promise<StoredSubscription | null> {
    const tokenHash = await sha256Hex(token);
    const id = await kv.get(tokenIndexKey(tokenHash), "text");
    if (!id) return null;
    const subs = await listStoredSubscriptions();
    const target = subs.find((item) => item.id === id && item.tokenHash === tokenHash);
    return target ?? null;
  }

  async function getConfig(): Promise<{ config: Record<string, unknown>; isDefault: boolean }> {
    const stored = await readJson<Record<string, unknown>>(kv, KEY_CONFIG);
    if (!isPlainObject(stored)) {
      return { config: buildDefaultUserConfig("standard") as unknown as Record<string, unknown>, isDefault: true };
    }
    return { config: stored, isDefault: false };
  }

  async function putConfig(config: Record<string, unknown>): Promise<void> {
    await kv.put(KEY_CONFIG, JSON.stringify(config));
  }

  async function resetConfig(): Promise<void> {
    await kv.delete(KEY_CONFIG);
  }

  // ---------- 扩展脚本 ----------

  function toScriptDto(stored: StoredExtensionScript, origin: string): ExtensionScriptDto {
    return {
      ...stored,
      ...(stored.shareCode
        ? {
            shareUrl: `${origin}/s/${stored.shareCode}`,
            sharePageUrl: `${origin}/#/share/${stored.shareCode}`,
          }
        : {}),
    };
  }

  async function listStoredScripts(): Promise<StoredExtensionScript[]> {
    return readJsonArray<StoredExtensionScript>(kv, KEY_SCRIPTS);
  }

  async function writeScripts(scripts: StoredExtensionScript[]): Promise<void> {
    await kv.put(KEY_SCRIPTS, JSON.stringify(scripts));
  }

  async function listScripts(origin: string): Promise<ExtensionScriptDto[]> {
    const stored = await listStoredScripts();
    return stored.map((item) => toScriptDto(item, origin));
  }

  async function readScriptContent(scriptId: string): Promise<string | null> {
    const secret = requireEncryptionKey(env);
    const cipher = await kv.get(scriptContentKey(scriptId), "text");
    if (!cipher) return null;
    try {
      return await decryptString(cipher, secret);
    } catch {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "扩展脚本解密失败，请重新导入（ENCRYPTION_KEY 可能已更换）"
      );
    }
  }

  async function getScriptContent(scriptId: string): Promise<string | null> {
    const stored = await listStoredScripts();
    if (!stored.some((item) => item.id === scriptId)) return null;
    return readScriptContent(scriptId);
  }

  async function createScript(
    input: ExtensionScriptInput,
    origin: string
  ): Promise<ExtensionScriptDto> {
    const secret = requireEncryptionKey(env);
    const stored = await listStoredScripts();
    if (stored.length >= MAX_SCRIPTS) {
      throw new ApiError(400, "VALIDATION_ERROR", `最多允许 ${MAX_SCRIPTS} 个扩展脚本`);
    }
    const now = new Date().toISOString();
    const record: StoredExtensionScript = {
      id: randomId(),
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      enabled: input.enabled ?? true,
      size: scriptByteLength(input.content),
      createdAt: now,
      updatedAt: now,
    };
    // 正文单独存键并静态加密，元数据列表保持轻量
    await kv.put(scriptContentKey(record.id), await encryptString(input.content, secret));
    await writeScripts([...stored, record]);
    return toScriptDto(record, origin);
  }

  async function updateScript(
    id: string,
    patch: ExtensionScriptPatch,
    origin: string
  ): Promise<ExtensionScriptDto | null> {
    const secret = requireEncryptionKey(env);
    const stored = await listStoredScripts();
    const index = stored.findIndex((item) => item.id === id);
    if (index < 0) return null;

    if (patch.content !== undefined) {
      await kv.put(scriptContentKey(id), await encryptString(patch.content, secret));
    }
    const updated: StoredExtensionScript = {
      ...stored[index],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.content !== undefined ? { size: scriptByteLength(patch.content) } : {}),
      updatedAt: new Date().toISOString(),
    };
    // 空描述按清空处理，避免存下无意义的空串
    if (!updated.description) delete updated.description;

    stored[index] = updated;
    await writeScripts(stored);
    return toScriptDto(updated, origin);
  }

  async function deleteScript(id: string): Promise<boolean> {
    const stored = await listStoredScripts();
    const next = stored.filter((item) => item.id !== id);
    if (next.length === stored.length) return false;
    await writeScripts(next);
    await kv.delete(scriptContentKey(id));
    return true;
  }

  /** 生成（或轮换）分享码：旧分享链接立即失效 */
  async function enableScriptShare(
    id: string,
    origin: string
  ): Promise<ExtensionScriptDto | null> {
    const stored = await listStoredScripts();
    const index = stored.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const updated: StoredExtensionScript = {
      ...stored[index],
      shareCode: newScriptShareCode(),
      updatedAt: new Date().toISOString(),
    };
    stored[index] = updated;
    await writeScripts(stored);
    return toScriptDto(updated, origin);
  }

  /** 关闭分享：清掉分享码，公开链接立即失效 */
  async function disableScriptShare(
    id: string,
    origin: string
  ): Promise<ExtensionScriptDto | null> {
    const stored = await listStoredScripts();
    const index = stored.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const { shareCode: _shareCode, ...rest } = stored[index];
    const updated: StoredExtensionScript = {
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    stored[index] = updated;
    await writeScripts(stored);
    return toScriptDto(updated, origin);
  }

  /** 公开分享读取：未分享、已停用或分享码不存在都按不存在处理 */
  async function findScriptByShareCode(
    shareCode: string
  ): Promise<{ script: ExtensionScriptDto; content: string } | null> {
    const stored = await listStoredScripts();
    const target = stored.find((item) => item.shareCode === shareCode);
    if (!target || !target.enabled) return null;
    const content = await readScriptContent(target.id);
    if (content === null) return null;
    return { script: toScriptDto(target, ""), content };
  }

  async function getSnapshot(sourceId: string): Promise<SnapshotRecord | null> {
    return readJson<SnapshotRecord>(kv, snapshotKey(sourceId));
  }

  async function putSnapshot(record: SnapshotRecord): Promise<void> {
    await kv.put(snapshotKey(record.sourceId), JSON.stringify(record), {
      expirationTtl: TTL_SNAPSHOT,
    });
  }

  async function deleteSnapshot(sourceId: string): Promise<void> {
    await kv.delete(snapshotKey(sourceId));
  }

  async function getCache(subId: string): Promise<CacheRecord | null> {
    return readJson<CacheRecord>(kv, cacheKey(subId));
  }

  async function putCache(record: CacheRecord): Promise<void> {
    await kv.put(cacheKey(record.subscriptionId), JSON.stringify(record), {
      expirationTtl: TTL_CACHE,
    });
  }

  async function deleteCache(subId: string): Promise<void> {
    await kv.delete(cacheKey(subId));
  }

  async function getStatus(): Promise<StatusRecord | null> {
    return readJson<StatusRecord>(kv, KEY_STATUS);
  }

  async function putStatus(status: StatusRecord): Promise<void> {
    await kv.put(KEY_STATUS, JSON.stringify(status));
  }

  async function acquireLock(owner: string): Promise<boolean> {
    const existing = await kv.get(KEY_LOCK, "text");
    if (existing) return false;
    await kv.put(KEY_LOCK, owner, { expirationTtl: TTL_LOCK });
    return true;
  }

  async function releaseLock(owner: string): Promise<void> {
    const existing = await kv.get(KEY_LOCK, "text");
    if (existing === owner) await kv.delete(KEY_LOCK);
  }

  return {
    listSources,
    listStoredSources,
    listStoredSubscriptions,
    saveSources,
    listSubscriptions,
    createSubscription,
    deleteSubscription,
    updateSubscription,
    rotateSubscriptionToken,
    findSubscriptionByToken,
    getConfig,
    putConfig,
    resetConfig,
    listScripts,
    getScriptContent,
    createScript,
    updateScript,
    deleteScript,
    enableScriptShare,
    disableScriptShare,
    findScriptByShareCode,
    getSnapshot,
    putSnapshot,
    deleteSnapshot,
    getCache,
    putCache,
    deleteCache,
    getStatus,
    putStatus,
    acquireLock,
    releaseLock,
  };
}

export type Store = ReturnType<typeof createStore>;


