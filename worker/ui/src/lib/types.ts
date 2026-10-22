// 管理页与 Worker API 之间的 DTO 形状（对应 worker/src/types.ts 与 worker/src/dashboard.ts）
export type SourceKind = "remote" | "manual";

/** 节点显示名覆盖表：key 是节点内容指纹，value 是用户设置的显示名 */
export type NodeRenames = Record<string, string>;

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

export type SubscriptionDto = {
  id: string;
  name: string;
  sourceIds: string[];
  link: string;
  createdAt: string;
  updatedAt: string;
};

/** 扩展脚本（Clash Verge Rev 风格 main(config) 脚本）元数据；正文按需单独拉取 */
export type ExtensionScriptDto = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** 正文的 UTF-8 字节数 */
  size: number;
  /** 公开分享码；为空表示未分享 */
  shareCode?: string;
  /** 原始脚本地址，客户端可直接拉取导入 */
  shareUrl?: string;
  /** 面向人的分享页面地址 */
  sharePageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScriptContentResponse = { content: string };

/** 公开分享接口返回的脚本内容（无需 admin token） */
export type SharedScriptResponse = {
  script: {
    name: string;
    description: string;
    content: string;
    size: number;
    updatedAt: string;
  };
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
  scripts: ExtensionScriptDto[];
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
  nodeRenames?: NodeRenames;
};

/** 解析出的节点摘要（名称 + 协议 + 身份字段） */
export type NodeSummary = {
  key: string;
  name: string;
  originName: string;
  type: string;
  server?: string;
  port?: number;
  renamed: boolean;
};

export type ParseNodesResponse = {
  nodes: NodeSummary[];
  totalParsed: number;
  totalFailed: number;
  errors: string[];
};

export type SourceNodesResponse = {
  source: {
    id: string;
    name: string;
    kind: SourceKind;
    enabled: boolean;
    nodeRenames: NodeRenames;
  };
  fetchedAt: string | null;
  nodeCount: number;
  renamedCount: number;
  nodes: NodeSummary[];
  parseErrors: string[];
};

export type ProtocolCount = { type: string; count: number };

export type DashboardSourceStat = {
  sourceId: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  nodeCount: number;
  renamedCount: number;
  fetchedAt: string | null;
  ok: boolean | null;
  error?: string;
  protocols: ProtocolCount[];
};

export type DashboardLastRun = {
  at: string;
  trigger: "cron" | "manual";
  durationMs: number;
  sourceOk: number;
  sourceFailed: number;
  subscriptionOk: number;
  subscriptionFailed: number;
};

export type DashboardWarning = {
  level: "warning" | "error";
  message: string;
};

export type DashboardStats = {
  generatedAt: string;
  sources: { total: number; enabled: number; remote: number; manual: number };
  subscriptions: { total: number; allSources: number; scoped: number };
  nodes: { total: number; renamed: number; protocols: ProtocolCount[] };
  sourceStats: DashboardSourceStat[];
  lastRun: DashboardLastRun | null;
  warnings: DashboardWarning[];
};

/** 管理页顶部导航的页面 id */
export type PageId = "dashboard" | "sources" | "subscriptions" | "scripts" | "status" | "config";
