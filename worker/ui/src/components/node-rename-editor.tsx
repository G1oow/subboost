import * as React from "react";
import { RotateCcw, Search } from "lucide-react";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { ProtocolBadge } from "@subboost/ui/components/ui/protocol-badge";
import { cn } from "@subboost/ui/lib/utils";
import type { NodeRenames, NodeSummary } from "../lib/types";

export type NodeRenameEditorProps = {
  nodes: NodeSummary[];
  renames: NodeRenames;
  onChange: (next: NodeRenames) => void;
  loading?: boolean;
  emptyHint?: string;
  maxHeightClassName?: string;
  className?: string;
};

const STAGGER = ["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5", "stagger-6", "stagger-7", "stagger-8"];

function matchesQuery(node: NodeSummary, query: string): boolean {
  if (!query) return true;
  const haystack = `${node.name} ${node.originName} ${node.type} ${node.server ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

/**
 * 节点列表 + 逐节点改名。
 * 名称留空或改回原名时会自动移除覆盖项，避免存一堆无效映射。
 */
export function NodeRenameEditor({
  nodes,
  renames,
  onChange,
  loading = false,
  emptyHint = "还没有解析到节点。",
  maxHeightClassName = "max-h-[320px]",
  className,
}: NodeRenameEditorProps) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visible = React.useMemo(
    () => nodes.filter((node) => matchesQuery(node, normalizedQuery)),
    [nodes, normalizedQuery]
  );
  const renamedCount = React.useMemo(
    () => nodes.filter((node) => Boolean(renames[node.key])).length,
    [nodes, renames]
  );

  const setName = (node: NodeSummary, rawValue: string) => {
    const value = rawValue.trim();
    const next: NodeRenames = { ...renames };
    if (!value || value === node.originName.trim()) delete next[node.key];
    else next[node.key] = value;
    onChange(next);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-50">
          共 {nodes.length} 个节点
          {renamedCount > 0 ? ` · 已改名 ${renamedCount} 个` : ""}
        </p>
        {nodes.length > 6 ? (
          <div className="relative w-full sm:w-56">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-40"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称 / 协议 / 服务器"
              aria-label="搜索节点"
              className="h-8 pl-8 text-xs"
            />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-10 w-full animate-shimmer" aria-hidden="true" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/15 px-3 py-6 text-center text-xs text-fg-45">
          {nodes.length === 0 ? emptyHint : "没有匹配的节点。"}
        </p>
      ) : (
        <ul className={cn("space-y-1.5 overflow-y-auto pr-1", maxHeightClassName)}>
          {visible.map((node, index) => {
            const renamed = Boolean(renames[node.key]);
            return (
              <li
                key={node.key}
                className={cn(
                  "animate-rise flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                  STAGGER[Math.min(index, STAGGER.length - 1)],
                  renamed ? "border-primary-500/40 bg-primary-500/10" : "border-ink/10 bg-ink/5"
                )}
              >
                <ProtocolBadge type={node.type} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <Input
                    value={renames[node.key] ?? ""}
                    onChange={(event) => setName(node, event.target.value)}
                    placeholder={node.originName || "未命名节点"}
                    aria-label={`重命名节点 ${node.originName || node.key}`}
                    className="h-8 text-sm"
                  />
                  <p className="mt-1 truncate text-[11px] text-fg-40">
                    原名 {node.originName || "—"}
                    {node.server ? ` · ${node.server}${node.port ? `:${node.port}` : ""}` : ""}
                  </p>
                </div>
                {renamed ? (
                  <IconButton
                    label={`恢复 ${node.originName || node.key} 的原名`}
                    variant="ghost"
                    onClick={() => setName(node, "")}
                  >
                    <RotateCcw aria-hidden="true" />
                  </IconButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {nodes.length > visible.length ? (
        <p className="text-[11px] text-fg-35">
          已隐藏 {nodes.length - visible.length} 个不匹配的节点。
        </p>
      ) : null}
    </div>
  );
}
