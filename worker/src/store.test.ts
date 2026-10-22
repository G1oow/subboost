import { beforeEach, describe, expect, it } from "vitest";
import { buildDefaultUserConfig } from "@subboost/core/config/defaults";
import { createStore, scriptContentKey, snapshotKey, tokenIndexKey } from "./store";
import { MemoryKV } from "./test-utils/memory-kv";
import { KEY_SOURCES, MAX_SCRIPTS, TTL_CACHE, TTL_LOCK, TTL_SNAPSHOT } from "./types";

const ENCRYPTION_KEY = "unit-test-encryption-key-0123456789";

function createEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = { SUBBOOST_KV: kv as unknown as KVNamespace, ENCRYPTION_KEY } as unknown as Env;
  return { env, kv };
}

describe("createStore sources", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("encrypts payload at rest and decrypts on read", async () => {
    const [saved] = await store.saveSources([
      { name: "remote", kind: "remote", url: "https://example.com/sub?token=abc" },
    ]);
    expect(saved.url).toBe("https://example.com/sub?token=abc");

    const raw = JSON.parse(kv.raw(KEY_SOURCES) as string) as Array<{ payloadEnc: string }>;
    expect(raw).toHaveLength(1);
    expect(raw[0].payloadEnc.startsWith("v1:")).toBe(true);
    expect(raw[0].payloadEnc).not.toContain("example.com");

    const listed = await store.listSources();
    expect(listed[0].url).toBe("https://example.com/sub?token=abc");
  });

  it("stores manual text encrypted and returns manualText", async () => {
    const [saved] = await store.saveSources([
      { name: "manual", kind: "manual", manualText: "ss://abc" },
    ]);
    expect(saved.manualText).toBe("ss://abc");
    expect(saved.url).toBeUndefined();
    const listed = await store.listSources();
    expect(listed[0].manualText).toBe("ss://abc");
  });

  it("deletes snapshots for removed sources and keeps snapshots of retained sources", async () => {
    const [first, second] = await store.saveSources([
      { name: "a", kind: "manual", manualText: "ss://a" },
      { name: "b", kind: "manual", manualText: "ss://b" },
    ]);
    for (const source of [first, second]) {
      await store.putSnapshot({
        sourceId: source.id,
        nodes: [],
        nodeCount: 0,
        fetchedAt: new Date().toISOString(),
        parseErrors: [],
      });
    }
    expect(kv.has(snapshotKey(first.id))).toBe(true);
    expect(kv.has(snapshotKey(second.id))).toBe(true);

    await store.saveSources([{ id: first.id, name: "a", kind: "manual", manualText: "ss://a" }]);
    const remaining = await store.listStoredSources();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
    // 被移除源的快照删除，保留源的快照仍在
    expect(kv.has(snapshotKey(second.id))).toBe(false);
    expect(kv.has(snapshotKey(first.id))).toBe(true);
  });

  it("keeps ids stable when inputs carry an id", async () => {
    const [first] = await store.saveSources([{ name: "a", kind: "manual", manualText: "ss://a" }]);
    const [updated] = await store.saveSources([
      { id: first.id, name: "a2", kind: "manual", manualText: "ss://a2" },
    ]);
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
  });

  it("throws CONFIGURATION_ERROR when ENCRYPTION_KEY is missing", async () => {
    const kvOnly = new MemoryKV();
    const storeWithoutKey = createStore({ SUBBOOST_KV: kvOnly as unknown as KVNamespace } as unknown as Env);
    await expect(storeWithoutKey.listSources()).rejects.toMatchObject({
      status: 503,
      code: "CONFIGURATION_ERROR",
    });
  });
});

describe("createStore subscriptions", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("creates a subscription with a 43-char token and token index", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    expect(token).toHaveLength(43);
    expect(dto.link).toBe(`/sub/${token}`);

    const storedRaw = JSON.parse(kv.raw("meta:subs") as string) as Array<{ tokenHash: string; tokenEnc: string }>;
    expect(storedRaw).toHaveLength(1);
    expect(storedRaw[0].tokenEnc.startsWith("v1:")).toBe(true);
    expect(kv.has(tokenIndexKey(storedRaw[0].tokenHash))).toBe(true);

    const found = await store.findSubscriptionByToken(token);
    expect(found?.id).toBe(dto.id);
  });

  it("rotates the token so the old token stops resolving", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    const rotated = await store.rotateSubscriptionToken(dto.id, "https://worker.example.com");
    expect(rotated).not.toBeNull();
    expect(rotated?.link.startsWith("https://worker.example.com/sub/")).toBe(true);

    await expect(store.findSubscriptionByToken(token)).resolves.toBeNull();
    const newToken = rotated?.link.split("/sub/")[1] as string;
    await expect(store.findSubscriptionByToken(newToken)).resolves.toMatchObject({ id: dto.id });
  });

  it("deletes subscription, token index and cache", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    await store.putCache({
      subscriptionId: dto.id,
      yaml: "proxies: []",
      nodeCount: 0,
      generatedAt: new Date().toISOString(),
      configHash: "hash",
    });
    await expect(store.deleteSubscription(dto.id)).resolves.toBe(true);
    await expect(store.findSubscriptionByToken(token)).resolves.toBeNull();
    await expect(store.getCache(dto.id)).resolves.toBeNull();
  });
});

describe("createStore TTLs and config", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("uses the documented TTLs", async () => {
    await store.putSnapshot({
      sourceId: "s1",
      nodes: [],
      nodeCount: 0,
      fetchedAt: new Date().toISOString(),
      parseErrors: [],
    });
    await store.putCache({
      subscriptionId: "sub1",
      yaml: "proxies: []",
      nodeCount: 0,
      generatedAt: new Date().toISOString(),
      configHash: "h",
    });
    await store.acquireLock("owner");

    expect(kv.expirationTtls.get(snapshotKey("s1"))).toBe(TTL_SNAPSHOT);
    expect(kv.expirationTtls.get("cache:sub1")).toBe(TTL_CACHE);
    expect(kv.expirationTtls.get("meta:refresh-lock")).toBe(TTL_LOCK);
  });

  it("returns the standard default config when unset", async () => {
    const result = await store.getConfig();
    expect(result.isDefault).toBe(true);
    expect(result.config).toEqual(buildDefaultUserConfig("standard"));
  });

  it("round-trips a custom config and resets to default", async () => {
    await store.putConfig({ mixedPort: 1234 });
    const stored = await store.getConfig();
    expect(stored.isDefault).toBe(false);
    expect(stored.config.mixedPort).toBe(1234);
    await store.resetConfig();
    const reset = await store.getConfig();
    expect(reset.isDefault).toBe(true);
  });

  it("acquires and releases the refresh lock", async () => {
    await expect(store.acquireLock("a")).resolves.toBe(true);
    await expect(store.acquireLock("b")).resolves.toBe(false);
    await store.releaseLock("b");
    await expect(store.acquireLock("b")).resolves.toBe(false);
    await store.releaseLock("a");
    await expect(store.acquireLock("b")).resolves.toBe(true);
  });
});


const SCRIPT_BODY = "function main(config) {\n  return config;\n}\n";

describe("createStore scripts", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("stores script content encrypted in its own key", async () => {
    const created = await store.createScript(
      { name: "Steam", content: SCRIPT_BODY },
      "https://worker.example.com"
    );
    expect(created.name).toBe("Steam");
    expect(created.enabled).toBe(true);
    expect(created.size).toBe(new TextEncoder().encode(SCRIPT_BODY).byteLength);
    expect(created.shareUrl).toBeUndefined();

    const raw = kv.raw(scriptContentKey(created.id)) as string;
    expect(raw.startsWith("v1:")).toBe(true);
    expect(raw).not.toContain("function main");

    await expect(store.getScriptContent(created.id)).resolves.toBe(SCRIPT_BODY);
    const listed = await store.listScripts("https://worker.example.com");
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Steam");
  });

  it("updates metadata and content", async () => {
    const created = await store.createScript(
      { name: "A", description: "desc", content: SCRIPT_BODY },
      "https://worker.example.com"
    );
    const updated = await store.updateScript(
      created.id,
      { name: "B", description: "", enabled: false, content: `${SCRIPT_BODY}// tail\n` },
      "https://worker.example.com"
    );
    expect(updated).toMatchObject({ name: "B", enabled: false });
    expect(updated?.description).toBeUndefined();
    expect(updated?.size).toBeGreaterThan(created.size);
    await expect(store.getScriptContent(created.id)).resolves.toBe(`${SCRIPT_BODY}// tail\n`);

    await expect(store.updateScript("missing", { name: "x" }, "")).resolves.toBeNull();
  });

  it("returns null for unknown scripts", async () => {
    await expect(store.getScriptContent("nope")).resolves.toBeNull();
  });

  it("enables, rotates and disables sharing", async () => {
    const created = await store.createScript({ name: "A", content: SCRIPT_BODY }, "");
    const shared = await store.enableScriptShare(created.id, "https://worker.example.com");
    expect(shared?.shareCode).toBeTruthy();
    expect(shared?.shareUrl).toBe(`https://worker.example.com/s/${shared?.shareCode}`);
    expect(shared?.sharePageUrl).toBe(`https://worker.example.com/#/share/${shared?.shareCode}`);

    const rotated = await store.enableScriptShare(created.id, "https://worker.example.com");
    expect(rotated?.shareCode).not.toBe(shared?.shareCode);
    const found = await store.findScriptByShareCode(rotated!.shareCode!);
    expect(found?.content).toBe(SCRIPT_BODY);
    // 轮换后旧分享码立即失效
    await expect(store.findScriptByShareCode(shared!.shareCode!)).resolves.toBeNull();

    const disabled = await store.disableScriptShare(created.id, "https://worker.example.com");
    expect(disabled?.shareCode).toBeUndefined();
    await expect(store.findScriptByShareCode(rotated!.shareCode!)).resolves.toBeNull();

    await expect(store.enableScriptShare("missing", "")).resolves.toBeNull();
    await expect(store.disableScriptShare("missing", "")).resolves.toBeNull();
  });

  it("hides disabled scripts from the share lookup", async () => {
    const created = await store.createScript({ name: "A", content: SCRIPT_BODY }, "");
    const shared = await store.enableScriptShare(created.id, "");
    await store.updateScript(created.id, { enabled: false }, "");
    await expect(store.findScriptByShareCode(shared!.shareCode!)).resolves.toBeNull();
  });

  it("deletes scripts together with their content key", async () => {
    const created = await store.createScript({ name: "A", content: SCRIPT_BODY }, "");
    await expect(store.deleteScript(created.id)).resolves.toBe(true);
    expect(kv.has(scriptContentKey(created.id))).toBe(false);
    await expect(store.deleteScript(created.id)).resolves.toBe(false);
    await expect(store.listScripts("")).resolves.toEqual([]);
  });

  it("enforces the script count limit", async () => {
    for (let index = 0; index < MAX_SCRIPTS; index += 1) {
      await store.createScript({ name: `s${index}`, content: SCRIPT_BODY }, "");
    }
    await expect(
      store.createScript({ name: "extra", content: SCRIPT_BODY }, "")
    ).rejects.toThrow(/最多允许/);
  });

  it("fails closed without an encryption key", async () => {
    const env = { SUBBOOST_KV: kv as unknown as KVNamespace } as unknown as Env;
    const brokenStore = createStore(env);
    await expect(
      brokenStore.createScript({ name: "A", content: SCRIPT_BODY }, "")
    ).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });

  it("surfaces decryption failures instead of leaking ciphertext", async () => {
    const created = await store.createScript({ name: "A", content: SCRIPT_BODY }, "");
    await kv.put(scriptContentKey(created.id), "v1:bad:bad");
    await expect(store.getScriptContent(created.id)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
