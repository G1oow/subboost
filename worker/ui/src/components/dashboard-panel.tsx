import * as React from "react";
import {
  Activity,
  ArrowRight,
  Boxes,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  Gauge,
  Layers,
  Link2,
  RefreshCw,
  Server,
  Sparkles,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import { Badge, badgeVariants } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { ProtocolBadge } from "@subboost/ui/components/ui/protocol-badge";
import { cn } from "@subboost/ui/lib/utils";
import { formatCount, formatDuration, formatPercent, formatRelativeTime } from "../lib/format";
import { useAnimatedNumber } from "../lib/use-animated-number";
import { SourceNodesInline, type SourceNodesLoadState } from "./source-nodes-inline";
import type {
  AppState,
  DashboardSourceStat,
  DashboardStats,
  PageId,
  ProtocolCount,
  SourceNodesResponse,
} from "../lib/types";

export type DashboardPanelProps = {
  state: AppState;
  stats: DashboardStats | null;
  statsLoading?: boolean;
  refreshing?: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (page: PageId) => void;
  /** 展开「源健康」某一行时读取该源的节点列表 */
  onLoadNodes?: (sourceId: string) => Promise<SourceNodesResponse>;
};

const STAGGER = ["stagger-1", "stagger-2", "stagger-3", "stagger-4"];

function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value);
  return <span className={cn("tabular-nums", className)}>{formatCount(animated)}</span>;
}

function StatCard({
  label,
  value,
  hint,
  icon,
  index,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  hint: React.ReactNode;
  icon: React.ReactNode;
  index: number;
  accent: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-fg-50">{label}</p>
        <span
          aria-hidden="true"
          className={cn("flex h-8 w-8 items-center justify-center rounded-xl border", accent)}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold leading-none text-fg">
        <AnimatedCount value={value} />
      </p>
      <p className="mt-2 text-[11px] text-fg-45">{hint}</p>
    </>
  );

  const className = cn(
    "animate-rise hover-lift w-full rounded-2xl border border-ink/10 bg-surface p-4 text-left shadow-(--surface-shadow)",
    STAGGER[index % STAGGER.length]
  );

  if (!onClick) return <div className={className}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(className, "hover:border-primary-500/40")}>
      {content}
    </button>
  );
}

function protocolWidth(item: ProtocolCount, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(2, Math.round((item.count / total) * 100))}%`;
}

function buildFallbackSourceStats(state: AppState): DashboardSourceStat[] {
  const statusById = new Map((state.status?.sources ?? []).map((item) => [item.sourceId, item]));
  return state.sources.map((source) => {
    const status = statusById.get(source.id);
    return {
      sourceId: source.id,
      name: source.name,
      kind: source.kind,
      enabled: source.enabled,
      nodeCount: status?.nodeCount ?? 0,
      renamedCount: Object.keys(source.nodeRenames ?? {}).length,
      fetchedAt: null,
      ok: status ? status.ok : null,
      ...(status?.error ? { error: status.error } : {}),
      protocols: [],
    };
  });
}

export function DashboardPanel({
  state,
  stats,
  statsLoading = false,
  refreshing = false,
  onRefresh,
  onNavigate,
  onLoadNodes,
}: DashboardPanelProps) {
  const sourceStats = React.useMemo(
    () => stats?.sourceStats ?? buildFallbackSourceStats(state),
    [stats, state]
  );

  const [expandedSourceId, setExpandedSourceId] = React.useState<string | null>(null);
  const [sourceNodes, setSourceNodes] = React.useState<Record<string, SourceNodesLoadState>>({});
  const [showAllSources, setShowAllSources] = React.useState(false);

  const loadSourceNodes = React.useCallback(
    async (sourceId: string) => {
      if (!onLoadNodes) {
        setSourceNodes((current) => ({
          ...current,
          [sourceId]: { status: "error", message: "当前版本不支持读取节点列表。" },
        }));
        return;
      }
      setSourceNodes((current) => ({ ...current, [sourceId]: { status: "loading" } }));
      try {
        const data = await onLoadNodes(sourceId);
        setSourceNodes((current) => ({ ...current, [sourceId]: { status: "ready", data } }));
      } catch (err) {
        setSourceNodes((current) => ({
          ...current,
          [sourceId]: {
            status: "error",
            message: err instanceof Error ? err.message : "加载节点失败",
          },
        }));
      }
    },
    [onLoadNodes]
  );

  // 再点一次同一行就收起；首次展开时才请求节点，之后复用缓存
  const toggleSourceNodes = (sourceId: string) => {
    if (expandedSourceId === sourceId) {
      setExpandedSourceId(null);
      return;
    }
    setExpandedSourceId(sourceId);
    if (!sourceNodes[sourceId]) void loadSourceNodes(sourceId);
  };

  const enabledSources = stats?.sources.enabled ?? state.sources.filter((item) => item.enabled).length;
  const totalSources = stats?.sources.total ?? state.sources.length;
  const remoteSources = stats?.sources.remote ?? state.sources.filter((item) => item.kind === "remote").length;
  const manualSources = stats?.sources.manual ?? state.sources.filter((item) => item.kind === "manual").length;
  const totalSubscriptions = stats?.subscriptions.total ?? state.subscriptions.length;
  const allSourceSubscriptions =
    stats?.subscriptions.allSources ?? state.subscriptions.filter((item) => item.sourceIds.length === 0).length;
  const totalNodes =
    stats?.nodes.total ??
    (state.status?.sources.reduce((sum, item) => sum + (item.nodeCount ?? 0), 0) ?? 0);
  const renamedNodes = stats?.nodes.renamed ?? 0;
  const protocols = stats?.nodes.protocols ?? [];
  const warnings = stats?.warnings ?? [];

  const lastRunAt = stats?.lastRun?.at ?? state.status?.lastRunAt ?? null;
  const lastRunTrigger = stats?.lastRun?.trigger ?? state.status?.lastTrigger ?? null;
  const lastRunDuration = stats?.lastRun?.durationMs ?? state.status?.durationMs ?? null;
  const failedSources = stats?.lastRun?.sourceFailed ?? 0;

  const health =
    warnings.some((item) => item.level === "error")
      ? { label: "需要处理", variant: "destructive" as const }
      : warnings.length > 0
        ? { label: "有提醒", variant: "warning" as const }
        : totalSources === 0
          ? { label: "待配置", variant: "outline" as const }
          : { label: "运行正常", variant: "success" as const };

  const handleRefresh = async () => {
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 animate-float rounded-full bg-indigo-500/10 blur-3xl"
        />
        <CardContent className="relative flex flex-col gap-5 p-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={health.variant} className="gap-1">
                {health.variant === "success" ? (
                  <CircleCheck aria-hidden="true" className="h-3 w-3" />
                ) : health.variant === "destructive" ? (
                  <CircleAlert aria-hidden="true" className="h-3 w-3" />
                ) : (
                  <Sparkles aria-hidden="true" className="h-3 w-3" />
                )}
                {health.label}
              </Badge>
              <span className="text-xs text-fg-45">{state.app.name}</span>
            </div>
            <h2 className="text-xl font-semibold text-fg sm:text-2xl">
              {enabledSources > 0 ? `${formatCount(enabledSources)} 个源正在供节点` : "先添加一个源开始聚合"}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-50">
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                最近刷新 {formatRelativeTime(lastRunAt)}
              </span>
              {lastRunTrigger ? (
                <span>触发方式：{lastRunTrigger === "cron" ? "定时" : "手动"}</span>
              ) : null}
              <span>耗时 {formatDuration(lastRunDuration)}</span>
              <span>自动刷新：每 12 小时</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
              {refreshing ? "刷新中…" : "立即刷新"}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("subscriptions")}>
              订阅链接
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="源"
          value={totalSources}
          icon={<Server className="h-4 w-4" />}
          accent="border-primary-500/30 bg-primary-500/15 text-primary-200"
          hint={`${enabledSources} 启用 · ${remoteSources} 远程 / ${manualSources} 手动`}
          onClick={() => onNavigate("sources")}
        />
        <StatCard
          index={1}
          label="订阅链接"
          value={totalSubscriptions}
          icon={<Link2 className="h-4 w-4" />}
          accent="border-indigo-500/30 bg-indigo-500/15 text-indigo-200"
          hint={`${allSourceSubscriptions} 条使用全部启用源`}
          onClick={() => onNavigate("subscriptions")}
        />
        <StatCard
          index={2}
          label="可用节点"
          value={totalNodes}
          icon={<Boxes className="h-4 w-4" />}
          accent="border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
          hint={renamedNodes > 0 ? `${renamedNodes} 个已改名` : "来自启用源的节点快照"}
          onClick={() => onNavigate("sources")}
        />
        <StatCard
          index={3}
          label="刷新失败源"
          value={failedSources}
          icon={<Gauge className="h-4 w-4" />}
          accent={
            failedSources > 0
              ? "border-red-500/30 bg-red-500/15 text-red-200"
              : "border-ink/10 bg-ink/5 text-fg-60"
          }
          hint={failedSources > 0 ? "展开提醒查看错误" : "上次刷新全部成功"}
          onClick={() => onNavigate("status")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="animate-rise stagger-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Waypoints aria-hidden="true" className="h-4 w-4 text-primary-300" />
                协议分布
              </CardTitle>
              <p className="text-xs text-fg-45">按启用源解析出的节点协议统计</p>
            </div>
            <Badge variant="secondary">{protocols.length} 种</Badge>
          </CardHeader>
          <CardContent>
            {statsLoading && protocols.length === 0 ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="skeleton h-8 w-full animate-shimmer" aria-hidden="true" />
                ))}
              </div>
            ) : protocols.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-45">
                还没有节点数据，刷新一次或等待定时任务抓取。
              </p>
            ) : (
              <ul className="space-y-3">
                {protocols.map((item, index) => (
                  <li key={item.type} className="animate-fade-in-up space-y-1.5" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <ProtocolBadge type={item.type} />
                        <span className="text-fg-60">{formatCount(item.count)} 个节点</span>
                      </span>
                      <span className="text-fg-45">{formatPercent(item.count, totalNodes)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="bar-fill animate-bar-grow h-full rounded-full bg-gradient-to-r from-primary-500 to-indigo-400"
                        style={{ width: protocolWidth(item, totalNodes) }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="animate-rise stagger-3">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers aria-hidden="true" className="h-4 w-4 text-primary-300" />
                源健康
              </CardTitle>
              <p className="text-xs text-fg-45">节点数与最近一次刷新结果</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("sources")}>
              管理源
              <ArrowRight aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent>
            {sourceStats.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-45">还没有源。</p>
            ) : (
              <ul className="space-y-2">
                {(showAllSources ? sourceStats : sourceStats.slice(0, 6)).map((item, index) => {
                  const expanded = expandedSourceId === item.sourceId;
                  const panelId = `source-nodes-${item.sourceId}`;
                  return (
                    <li key={item.sourceId} className="animate-fade-in-up" style={{ animationDelay: `${index * 40}ms` }}>
                      <button
                        type="button"
                        onClick={() => toggleSourceNodes(item.sourceId)}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                          expanded
                            ? "border-primary-500/40 bg-primary-500/10"
                            : "border-ink/10 bg-ink/5 hover:border-ink/25 hover:bg-ink/10"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            !item.enabled
                              ? "bg-fg-30"
                              : item.ok === false
                                ? "animate-badge-pulse bg-red-400"
                                : item.ok === true
                                  ? "bg-emerald-400"
                                  : "bg-fg-40"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg-80">{item.name}</span>
                          <span className="block text-[11px] text-fg-40">
                            {item.kind === "remote" ? "远程" : "手动"}
                            {item.enabled ? "" : " · 已停用"}
                            {item.renamedCount > 0 ? ` · 改名 ${item.renamedCount}` : ""}
                          </span>
                        </span>
                        <span
                          className={badgeVariants({
                            variant: item.ok === false ? "destructive" : "secondary",
                          })}
                        >
                          {formatCount(item.nodeCount)}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "h-4 w-4 shrink-0 text-fg-40 transition-transform duration-300",
                            expanded && "rotate-180 text-primary-200"
                          )}
                        />
                      </button>
                      {expanded ? (
                        <div
                          id={panelId}
                          className="animate-fade-in-up mt-2 rounded-xl border border-ink/10 bg-ink/5 p-3"
                        >
                          <SourceNodesInline
                            state={sourceNodes[item.sourceId] ?? { status: "loading" }}
                            onRetry={() => void loadSourceNodes(item.sourceId)}
                            onOpenSourceManager={() => onNavigate("sources")}
                            emptyHint={
                              item.kind === "manual"
                                ? "该源还没有可解析的节点文本。"
                                : "还没有节点快照，先刷新一次即可看到节点。"
                            }
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {sourceStats.length > 6 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setShowAllSources((current) => !current)}
              >
                {showAllSources ? "收起" : `展开全部 ${sourceStats.length} 个源`}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("transition-transform duration-300", showAllSources && "rotate-180")}
                />
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {warnings.length > 0 ? (
        <Card className="animate-rise stagger-4 border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-400" />
              提醒
            </CardTitle>
            <Badge variant="warning">{warnings.length}</Badge>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {warnings.map((item, index) => (
                <li
                  key={`${item.level}-${index}`}
                  className={cn(
                    "animate-fade-in-up flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
                    item.level === "error"
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  )}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-words">{item.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="animate-rise stagger-4">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity aria-hidden="true" className="h-4 w-4 text-primary-300" />
            快捷操作
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" onClick={() => onNavigate("sources")}>
            <Server aria-hidden="true" />
            导入 / 管理源
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("subscriptions")}>
            <Link2 aria-hidden="true" />
            创建订阅链接
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("config")}>
            <Sparkles aria-hidden="true" />
            调整生成配置
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
