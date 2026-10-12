// 管理页与 Worker API 之间的 DTO 形状（对应 worker/src/types.ts）
export type SourceKind = "remote" | "manual";

export type SourceDto = {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string;
  manualText?: string;
  enabled: boolean;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionDto = {
  id: string;
  name: string;
  sourceIds: string[];
  link: string;
  createdAt: string;
  updatedAt: string;
};

export type SourceRefreshStatus = {
  sourceId: string;
  ok: boolean;
  nodeCount?: number;
  error?: string;
};

export type SubscriptionRefreshStatus = {
  subscriptionId: string;
  ok: boolean;
  nodeCount?: number;
  error?: string;
};

export type StatusRecord = {
  lastRunAt: string;
  lastTrigger: "cron" | "manual";
  durationMs: number;
  sources: SourceRefreshStatus[];
  subscriptions: SubscriptionRefreshStatus[];
};

export type AppState = {
  app: { name: string; version: string };
  sources: SourceDto[];
  subscriptions: SubscriptionDto[];
  config: Record<string, unknown>;
  configIsDefault: boolean;
  status: StatusRecord | null;
};

export type SourceInput = {
  id?: string;
  name: string;
  kind: SourceKind;
  url?: string;
  manualText?: string;
  enabled?: boolean;
  userAgent?: string;
};
