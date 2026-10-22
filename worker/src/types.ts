import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";

// KV key 常量
export const KEY_SOURCES = "meta:sources";
export const KEY_SUBS = "meta:subs";
export const KEY_CONFIG = "meta:config";
export const KEY_STATUS = "meta:status";
export const KEY_LOCK = "meta:refresh-lock";
export const KEY_SCRIPTS = "meta:scripts";

// TTL（秒）
export const TTL_SNAPSHOT = 604800; // 7 天
export const TTL_CACHE = 172800; // 48 小时
export const TTL_LOCK = 600; // 10 分钟

// 业务上限
export const MAX_SOURCES = 50;
export const MAX_SUBSCRIPTIONS = 20;
export const MAX_SOURCE_NAME_LENGTH = 80;
export const MAX_NODE_NAME_LENGTH = 120;
export const MAX_NODE_RENAMES = 4000;
export const MAX_PREVIEW_NODES = 500;
export const MAX_USER_AGENT_LENGTH = 200;
export const MAX_MANUAL_TEXT_BYTES = 512 * 1024;
export const MAX_PARSE_ERRORS = 20;
// 扩展脚本：单个脚本正文上限 256 KiB，数量上限 20（KV 单值 25 MiB，正文单独存键）
export const MAX_SCRIPTS = 20;
export const MAX_SCRIPT_NAME_LENGTH = 80;
export const MAX_SCRIPT_DESCRIPTION_LENGTH = 300;
export const MAX_SCRIPT_BYTES = 256 * 1024;
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
  // 节点显示名覆盖表（key 见 nodeRenameKey）
  nodeRenames?: NodeRenames;
};

export type SourceDto = {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string;
  manualText?: string;
  enabled: boolean;
  userAgent?: string;
  nodeRenames?: NodeRenames;
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
  nodeRenames?: NodeRenames;
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

/**
 * 节点显示名覆盖表：key 由 nodeRenameKey(node) 生成（节点内容指纹，不含名称），
 * value 是用户为这个节点设置的显示名。保存后立即作用于订阅生成与节点列表。
 */
export type NodeRenames = Record<string, string>;

export type NodeSummary = {
  // 稳定的节点标识（内容指纹哈希），供前端回写重命名映射
  key: string;
  // 最终展示名（已应用重命名）
  name: string;
  // 解析出来的原始名称（未应用重命名）
  originName: string;
  type: string;
  server?: string;
  port?: number;
  renamed: boolean;
};


// ---------- 扩展脚本（Clash Verge Rev 风格 main(config) 脚本） ----------

/** 脚本正文单独存 KV（`script:<id>`），元数据列表只保存轻量字段 */
export type StoredExtensionScript = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** 脚本正文的 UTF-8 字节数，供列表展示 */
  size: number;
  /** 公开分享码；为空表示未分享 */
  shareCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtensionScriptDto = StoredExtensionScript & {
  /** 原始脚本地址，客户端可直接拉取导入（仅已分享时存在） */
  shareUrl?: string;
  /** 面向人的分享页面地址（仅已分享时存在） */
  sharePageUrl?: string;
};

export type ExtensionScriptInput = {
  name: string;
  description?: string;
  content: string;
  enabled?: boolean;
};

export type ExtensionScriptPatch = {
  name?: string;
  description?: string;
  enabled?: boolean;
  content?: string;
};
