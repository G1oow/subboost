import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@subboost/ui/components/ui/table";
import { useToast } from "@subboost/ui/components/ui/toaster";
import type { AppState } from "../lib/types";

export type StatusPanelProps = {
  state: AppState;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
};

function formatTime(value?: string): string {
  if (!value) return "从未刷新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function StatusPanel({ state, onRefresh, refreshing }: StatusPanelProps) {
  const { toast } = useToast();
  const status = state.status;
  const sourceName = new Map(state.sources.map((source) => [source.id, source.name]));
  const subscriptionName = new Map(state.subscriptions.map((sub) => [sub.id, sub.name]));

  const handleRefresh = async () => {
    try {
      await onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "刷新失败";
      toast({
        variant: message.includes("刷新进行中") ? "warning" : "destructive",
        title: message.includes("刷新进行中") ? "刷新进行中" : "刷新失败",
        description: message,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>刷新状态</CardTitle>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
          立即刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-fg-60">
              <span>最近刷新：{formatTime(status.lastRunAt)}</span>
              <Badge variant="secondary">{status.lastTrigger === "cron" ? "定时" : "手动"}</Badge>
              <span>耗时 {status.durationMs} ms</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-fg-80">源</p>
              {status.sources.length === 0 ? (
                <p className="text-sm text-fg-50">暂无启用中的源。</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>源</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>节点数</TableHead>
                      <TableHead>错误</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.sources.map((item) => (
                      <TableRow key={item.sourceId}>
                        <TableCell>{sourceName.get(item.sourceId) ?? item.sourceId}</TableCell>
                        <TableCell>
                          <Badge variant={item.ok ? "success" : "destructive"}>{item.ok ? "成功" : "失败"}</Badge>
                        </TableCell>
                        <TableCell>{item.nodeCount ?? "-"}</TableCell>
                        <TableCell className="max-w-[320px] break-words text-xs text-fg-50">
                          {item.error ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-fg-80">订阅</p>
              {status.subscriptions.length === 0 ? (
                <p className="text-sm text-fg-50">暂无订阅。</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订阅</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>节点数</TableHead>
                      <TableHead>错误</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.subscriptions.map((item) => (
                      <TableRow key={`${item.subscriptionId}-${item.ok}`}>
                        <TableCell>{subscriptionName.get(item.subscriptionId) ?? item.subscriptionId}</TableCell>
                        <TableCell>
                          <Badge variant={item.ok ? "success" : "destructive"}>{item.ok ? "成功" : "失败"}</Badge>
                        </TableCell>
                        <TableCell>{item.nodeCount ?? "-"}</TableCell>
                        <TableCell className="max-w-[320px] break-words text-xs text-fg-50">
                          {item.error ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-fg-50">还没有刷新记录，点击「立即刷新」抓取上游节点。</p>
        )}
      </CardContent>
    </Card>
  );
}
