import yaml from "js-yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeConfigHash,
  generateSubscription,
  getOrGenerateSubscription,
  normalizeConfigForGeneration,
  refreshAll,
  type PipelineDeps,
} from "./pipeline";
import { createStore, snapshotKey } from "./store";
import { MemoryKV } from "./test-utils/memory-kv";
import type { CacheRecord } from "./types";

const ENCRYPTION_KEY = "pipeline-test-key-0123456789";

function ssNode(name: string, port: number): string {
  const payload = Buffer.from(`aes-256-gcm:password`).toString("base64").replace(/=+$/, "");
  return `ss://${payload}@example.com:${port}#${name}`;
}

function base64Subscription(lines: string[]): string {
  return Buffer.from(lines.join("\n")).toString("base64");
}

function okResponse(text: string, headers: Record<string, string> = {}) {
  return { status: 200, headers, text, finalUrl: "https://example.com/sub" };
}

type Harness = {
  kv: MemoryKV;
  store: ReturnType<typeof createStore>;
  deps: PipelineDeps;
  clock: { set: (values: number[]) => void };
};

async function createHarness(): Promise<Harness> {
  const kv = new MemoryKV();
  const env = { SUBBOOST_KV: kv as unknown as KVNamespace, ENCRYPTION_KEY } as unknown as Env;
  const store = createStore(env);
  let queue: number[] = [];
  const fallback = Date.parse("2026-10-12T00:00:00.000Z");
  const clock = {
    set(values: number[]) {
      queue = [...values];
    },
  };
  const deps: PipelineDeps = {
    store,
    fetchText: (async () => okResponse("")) as unknown as PipelineDeps["fetchText"],
    now: () => new Date(queue.length > 0 ? (queue.shift() as number) : fallback),
    defaultUserAgent: "mihomo/test",
  };
  return { kv, store, deps, clock };
}

function proxiesFrom(yamlText: string): Array<{ name: string }> {
  const parsed = yaml.load(yamlText) as { proxies: Array<{ name: string }> };
  return parsed.proxies;
}

describe("generateSubscription", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  it("deduplicates identical nodes across sources and keeps first occurrence", async () => {
    const shared = ssNode("shared", 8388);
    const onlyA = ssNode("onlyA", 8389);
    const onlyB = ssNode("onlyB", 8390);
    h.deps.fetchText = (async (url: string) => {
      if (url === "https://a.example.com/sub") return okResponse(base64Subscription([shared, onlyA]));
      return okResponse(base64Subscription([shared, onlyB]));
    }) as unknown as PipelineDeps["fetchText"];

    const sources = await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "b", kind: "remote", url: "https://b.example.com/sub" },
    ]);
    const { dto } = await h.store.createSubscription({ name: "all", sourceIds: [] });
    const sub = await h.store.findSubscriptionByToken(dto.link.split("/sub/")[1]);
    expect(sub).not.toBeNull();

    const result = await generateSubscription(h.deps, sub!, { onDemand: true });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(proxiesFrom(result.cache.yaml)).toHaveLength(3);
    expect(result.cache.nodeCount).toBe(3);
  });

  it("keeps the historical snapshot when one source fails", async () => {
    h.deps.fetchText = (async (url: string) => {
      if (url === "https://good.example.com/sub") {
        return okResponse(base64Subscription([ssNode("good", 8388)]));
      }
      return { status: 500, headers: {}, text: "boom", finalUrl: url };
    }) as unknown as PipelineDeps["fetchText"];

    const sources = await h.store.saveSources([
      { name: "good", kind: "remote", url: "https://good.example.com/sub" },
      { name: "bad", kind: "remote", url: "https://bad.example.com/sub" },
    ]);
    // 预置 bad 源的历史快照
    const badId = sources[1].id;
    await h.store.putSnapshot({
      sourceId: badId,
      nodes: [{ name: "old", type: "ss", server: "example.com", port: 9999, cipher: "aes-256-gcm", password: "x" }],
      nodeCount: 1,
      fetchedAt: "2026-10-01T00:00:00.000Z",
      parseErrors: [],
    });

    const refresh = await refreshAll(h.deps, { trigger: "manual" });
    expect("status" in refresh).toBe(true);
    if (!("status" in refresh)) return;
    const badStatus = refresh.status.sources.find((item) => item.sourceId === badId);
    expect(badStatus?.ok).toBe(false);
    const goodStatus = refresh.status.sources.find((item) => item.sourceId === sources[0].id);
    expect(goodStatus?.ok).toBe(true);

    // 保护性快照：bad 源的快照未被覆盖
    const snapshot = await h.store.getSnapshot(badId);
    expect(snapshot?.nodeCount).toBe(1);
    expect(snapshot?.fetchedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("only includes nodes from the subscription's sourceIds", async () => {
    h.deps.fetchText = (async (url: string) => {
      if (url === "https://a.example.com/sub") return okResponse(base64Subscription([ssNode("a", 8388)]));
      return okResponse(base64Subscription([ssNode("b", 8389)]));
    }) as unknown as PipelineDeps["fetchText"];

    const sources = await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "b", kind: "remote", url: "https://b.example.com/sub" },
    ]);
    await h.store.putSnapshot({
      sourceId: sources[0].id,
      nodes: [{ name: "a", type: "ss", server: "example.com", port: 8388, cipher: "aes-256-gcm", password: "x" }],
      nodeCount: 1,
      fetchedAt: "2026-10-01T00:00:00.000Z",
      parseErrors: [],
    });
    await h.store.putSnapshot({
      sourceId: sources[1].id,
      nodes: [{ name: "b", type: "ss", server: "example.com", port: 8389, cipher: "aes-256-gcm", password: "x" }],
      nodeCount: 1,
      fetchedAt: "2026-10-01T00:00:00.000Z",
      parseErrors: [],
    });

    const { dto } = await h.store.createSubscription({ name: "one", sourceIds: [sources[0].id] });
    const sub = await h.store.findSubscriptionByToken(dto.link.split("/sub/")[1]);
    const result = await generateSubscription(h.deps, sub!, { onDemand: false });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(proxiesFrom(result.cache.yaml).map((p) => p.name)).toEqual(["a"]);
  });

  it("returns no-nodes when no snapshot has nodes", async () => {
    await h.store.saveSources([{ name: "empty", kind: "manual", manualText: "ss://x" }]);
    const { dto } = await h.store.createSubscription({ name: "empty", sourceIds: [] });
    const sub = await h.store.findSubscriptionByToken(dto.link.split("/sub/")[1]);
    const result = await generateSubscription(h.deps, sub!, { onDemand: false });
    expect(result).toEqual({ kind: "no-nodes" });
  });
});

describe("getOrGenerateSubscription", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  it("returns not-found for an unknown token", async () => {
    await expect(getOrGenerateSubscription(h.deps, "unknown")).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("regenerates when the config hash changes", async () => {
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: ssNode("m", 8388) }]);
    const { dto, token } = await h.store.createSubscription({ name: "s", sourceIds: [] });

    const first = await getOrGenerateSubscription(h.deps, token);
    expect(first.kind).toBe("ok");
    if (first.kind !== "ok") return;
    const firstHash = first.cache.configHash;
    expect(proxiesFrom(first.cache.yaml)).toHaveLength(1);

    await h.store.putConfig({ mixedPort: 45678 });
    const second = await getOrGenerateSubscription(h.deps, token);
    expect(second.kind).toBe("ok");
    if (second.kind !== "ok") return;
    expect(second.cache.configHash).not.toBe(firstHash);
    const parsed = yaml.load(second.cache.yaml) as Record<string, unknown>;
    expect(parsed["mixed-port"]).toBe(45678);
    expect(dto.id).toBe(second.sub.id);
  });

  it("reuses the cache when the config hash matches", async () => {
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: ssNode("m", 8388) }]);
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const first = await getOrGenerateSubscription(h.deps, token);
    expect(first.kind).toBe("ok");
    const cached: CacheRecord | null = await h.store.getCache(first.kind === "ok" ? first.sub.id : "");
    const second = await getOrGenerateSubscription(h.deps, token);
    expect(second.kind).toBe("ok");
    if (second.kind !== "ok") return;
    expect(second.cache.generatedAt).toBe(cached?.generatedAt);
  });

  it("returns no-nodes when every source is empty", async () => {
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: "ss://x" }]);
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("no-nodes");
  });
});

describe("refreshAll", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  it("returns skipped when the lock is already held", async () => {
    await h.store.acquireLock("someone-else");
    await expect(refreshAll(h.deps, { trigger: "cron" })).resolves.toEqual({ skipped: "locked" });
  });

  it("records cron trigger and duration", async () => {
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: ssNode("m", 8388) }]);
    const result = await refreshAll(h.deps, { trigger: "cron" });
    expect("status" in result).toBe(true);
    if (!("status" in result)) return;
    expect(result.status.lastTrigger).toBe("cron");
    expect(result.status.durationMs).toBeGreaterThanOrEqual(0);
    const stored = await h.store.getStatus();
    expect(stored?.lastTrigger).toBe("cron");
    // 锁应被释放
    await expect(h.store.acquireLock("again")).resolves.toBe(true);
  });

  it("stops starting new fetches after the soft deadline", async () => {
    const t0 = Date.parse("2026-10-12T00:00:00.000Z");
    // now() 调用顺序：owner、startedAt、源 a 的截止检查（通过）、源 b 的截止检查（超时）
    h.clock.set([t0, t0 + 1000, t0 + 1000, t0 + 13 * 60 * 1000]);
    const fetchImpl = vi.fn(async (url: string) =>
      okResponse(base64Subscription([ssNode(url, 8388)]))
    );
    h.deps.fetchText = fetchImpl as unknown as PipelineDeps["fetchText"];

    const sources = await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "b", kind: "remote", url: "https://b.example.com/sub" },
    ]);
    const result = await refreshAll(h.deps, { trigger: "manual" });
    expect("status" in result).toBe(true);
    if (!("status" in result)) return;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const bStatus = result.status.sources.find((item) => item.sourceId === sources[1].id);
    expect(bStatus?.ok).toBe(false);
    expect(bStatus?.error).toBe("deadline-exceeded");
  });

  it("aggregates userinfo only when every remote source provides all fields", async () => {
    h.deps.fetchText = (async (url: string) => {
      if (url === "https://a.example.com/sub") {
        return okResponse(base64Subscription([ssNode("a", 8388)]), {
          "subscription-userinfo": "upload=1; download=2; total=3; expire=1900000000",
        });
      }
      return okResponse(base64Subscription([ssNode("b", 8389)]), {
        "subscription-userinfo": "upload=10; download=20; total=30; expire=1800000000",
      });
    }) as unknown as PipelineDeps["fetchText"];

    await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "b", kind: "remote", url: "https://b.example.com/sub" },
    ]);
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.info).toEqual({ upload: 11, download: 22, total: 33, expire: 1800000000 });
  });

  it("returns null userinfo when only one source provides it", async () => {
    h.deps.fetchText = (async (url: string) => {
      if (url === "https://a.example.com/sub") {
        return okResponse(base64Subscription([ssNode("a", 8388)]), {
          "subscription-userinfo": "upload=1; download=2; total=3; expire=1900000000",
        });
      }
      return okResponse(base64Subscription([ssNode("b", 8389)]));
    }) as unknown as PipelineDeps["fetchText"];

    await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "b", kind: "remote", url: "https://b.example.com/sub" },
    ]);
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.info).toBeNull();
  });

  it("ignores manual sources when aggregating userinfo", async () => {
    h.deps.fetchText = (async () =>
      okResponse(base64Subscription([ssNode("a", 8388)]), {
        "subscription-userinfo": "upload=1; download=2; total=3; expire=1900000000",
      })) as unknown as PipelineDeps["fetchText"];

    await h.store.saveSources([
      { name: "a", kind: "remote", url: "https://a.example.com/sub" },
      { name: "m", kind: "manual", manualText: ssNode("m", 8389) },
    ]);
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.info).toEqual({ upload: 1, download: 2, total: 3, expire: 1900000000 });
  });

  it("writes a cache with TTL and a stable config hash", async () => {
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: ssNode("m", 8388) }]);
    const { token, dto } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(h.kv.expirationTtls.get(`cache:${dto.id}`)).toBe(172800);
    const { config } = await h.store.getConfig();
    expect(result.cache.configHash).toBe(await computeConfigHash(config));
    expect(h.kv.has(snapshotKey((await h.store.listSources())[0].id))).toBe(true);
  });
});


describe("normalizeConfigForGeneration", () => {
  it("drops a blank dnsYaml and keeps everything else", () => {
    expect(normalizeConfigForGeneration({ dnsYaml: "", mixedPort: 1 })).toEqual({ mixedPort: 1 });
    expect(normalizeConfigForGeneration({ dnsYaml: "  \n", mixedPort: 1 })).toEqual({ mixedPort: 1 });
  });

  it("keeps an explicit base config yaml and configs without dnsYaml untouched", () => {
    const explicit = { dnsYaml: "mixed-port: 1234\n", mixedPort: 1 };
    expect(normalizeConfigForGeneration(explicit)).toBe(explicit);
    const plain = { mixedPort: 1 };
    expect(normalizeConfigForGeneration(plain)).toBe(plain);
  });
});

describe("default config base sections", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
    await h.store.saveSources([{ name: "m", kind: "manual", manualText: ssNode("m", 8388) }]);
  });

  it("emits the default general section although the stored default config carries an empty dnsYaml", async () => {
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const { config } = await h.store.getConfig();
    expect(config.dnsYaml).toBe("");

    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const parsed = yaml.load(result.cache.yaml) as Record<string, unknown>;
    expect(parsed["mixed-port"]).toBe(7897);
    expect(parsed.dns).toBeDefined();
  });

  it("applies mixedPort edits made on the full default config", async () => {
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const { config } = await h.store.getConfig();
    await h.store.putConfig({ ...config, mixedPort: 45678 });

    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const parsed = yaml.load(result.cache.yaml) as Record<string, unknown>;
    expect(parsed["mixed-port"]).toBe(45678);
  });

  it("lets a non-empty dnsYaml override the default base sections", async () => {
    const { token } = await h.store.createSubscription({ name: "s", sourceIds: [] });
    const { config } = await h.store.getConfig();
    await h.store.putConfig({ ...config, dnsYaml: "mixed-port: 1234\n" });

    const result = await getOrGenerateSubscription(h.deps, token);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const parsed = yaml.load(result.cache.yaml) as Record<string, unknown>;
    expect(parsed["mixed-port"]).toBe(1234);
  });
});
