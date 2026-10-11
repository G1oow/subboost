type MemoryEntry = {
  value: string;
  expirationTtl?: number;
};

// 内存 KV 假实现，供单元测试使用（不模拟真实过期时间）
export class MemoryKV {
  private readonly entries = new Map<string, MemoryEntry>();
  readonly expirationTtls = new Map<string, number | undefined>();

  async get(key: string, type?: "text" | "json"): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (type === "json") {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    return entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    this.entries.set(key, { value, expirationTtl: options?.expirationTtl });
    this.expirationTtls.set(key, options?.expirationTtl);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
    this.expirationTtls.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    const prefix = options?.prefix ?? "";
    const keys = Array.from(this.entries.keys())
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  raw(key: string): string | undefined {
    return this.entries.get(key)?.value;
  }
}

export function createExecutionContext(): ExecutionContext {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil(promise: Promise<unknown>) {
      promises.push(promise);
    },
    passThroughOnException() {},
    props: {},
    promises,
  } as unknown as ExecutionContext;
}
