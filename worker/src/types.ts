import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";

// KV key 常量
export const KEY_SOURCES = "meta:sources";
export const KEY_SUBS = "meta:subs";
export const KEY_CONFIG = "meta:config";
export const KEY_STATUS = "meta:status";
export const KEY_LOCK = "meta:refresh-lock";

// TTL（秒）
export const TTL_SNAPSHOT = 604800; // 7 天
export const TTL_CACHE = 172800; // 48 小时
export const TTL_LOCK = 600; // 10 分钟

// 业务上限
export const MAX_SOURCES = 50;
export const MAX_SUBSCRIPTIONS = 20;
export const MAX_SOURCE_NAME_LENGTH = 80;
export const MAX_USER_AGENT_LENGTH = 200;
export const MAX_MANUAL_TEXT_BYTES = 512 * 1024;
export const MAX_PARSE_ERRORS = 20;
export const REFRESH_CONCURRENCY = 4;
export const REFRESH_SOFT_DEADLINE_MS = 12 * 60 * 1000;

export type SourceKind = "remote" | "manual";

export type SourceInput = {
  // 全量替换保存时携带既有 id，可保留该源的快照；缺省视为新建
  id?: string;
  name: string;
  kind: SourceKind;
  url?: string;
  manualText?: string;
  enabled?: boolean;
  userAgent?: string;
};

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

export type StoredSource = {
  id: string;
  name: string;
  kind: SourceKind;
  payloadEnc: string;
  enabled: boolean;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredSubscription = {
  id: string;
  name: string;
  tokenHash: string;
  tokenEnc: string;
  sourceIds: string[];
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

export type SnapshotRecord = {
  sourceId: string;
  nodes: ParsedNode[];
  nodeCount: number;
  fetchedAt: string;
  userInfo?: SubscriptionResponseInfo;
  parseErrors: string[];
};

export type CacheRecord = {
  subscriptionId: string;
  yaml: string;
  nodeCount: number;
  generatedAt: string;
  configHash: string;
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

