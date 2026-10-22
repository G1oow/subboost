import * as React from "react";
import { Copy, Download, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { useToast } from "@subboost/ui/components/ui/toaster";
import { copyTextToClipboard } from "@subboost/ui/lib/clipboard";
import { formatBytes, formatDateTime } from "../lib/format";
import type { SharedScriptResponse } from "../lib/types";

export type ShareViewProps = {
  /** 分享码，来自 `#/share/<code>` */
  code: string;
};

type ShareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; script: SharedScriptResponse["script"] };

/** 从 `#/share/<code>` 里取出分享码；不是分享路由时返回 null */
export function readShareCodeFromHash(hash: string): string | null {
  const match = /^#?\/?share\/([^/?#]+)/.exec(hash.trim());
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * 公开的扩展脚本分享页：不需要 admin token，只读展示脚本原文，
 * 方便在其他设备上打开并复制/下载后导入客户端。
 */
export function ShareView({ code }: ShareViewProps) {
  const { toast } = useToast();
  const [state, setState] = React.useState<ShareState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const response = await fetch(`/api/share/scripts/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          setState({
            status: "error",
            message: response.status === 404 ? "分享不存在或已关闭。" : "读取分享失败。",
          });
          return;
        }
        const data = (await response.json()) as SharedScriptResponse;
        if (!cancelled) setState({ status: "ready", script: data.script });
      } catch {
        if (!cancelled) setState({ status: "error", message: "网络异常，请稍后重试。" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const rawUrl =
    typeof window === "undefined" ? `/s/${code}` : `${window.location.origin}/s/${code}`;

  const handleCopy = async () => {
    if (state.status !== "ready") return;
    const ok = await copyTextToClipboard(state.script.content);
    toast(
      ok
        ? { variant: "success", title: "已复制脚本内容" }
        : { variant: "warning", title: "复制失败", description: "请手动选择内容复制。" }
    );
  };

  return (
    <div className="min-h-screen bg-page px-4 py-10 text-fg">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-fg">扩展脚本分享</h1>
            <Badge variant="outline">只读</Badge>
          </div>
          <Button variant="ghost" asChild>
            <a href="/">管理端</a>
          </Button>
        </div>

        {state.status === "loading" ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-fg-50">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              加载中…
            </CardContent>
          </Card>
        ) : state.status === "error" ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-fg-50">
              {state.message}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>{state.script.name}</CardTitle>
              {state.script.description ? (
                <p className="text-sm text-fg-50">{state.script.description}</p>
              ) : null}
              <p className="text-xs text-fg-45">
                {formatBytes(state.script.size)} · 更新于 {formatDateTime(state.script.updatedAt)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 rounded-xl border border-ink/10 bg-ink/5 p-3">
                <p className="text-xs font-medium text-fg-80">客户端导入地址</p>
                <p className="break-all font-mono text-xs text-fg-50">{rawUrl}</p>
                <p className="text-xs text-fg-45">
                  在 Clash Verge Rev 的全局扩展脚本里粘贴下方内容即可；也可以把上面的地址填进支持 URL
                  导入的客户端。
                </p>
              </div>

              <pre className="max-h-[52vh] overflow-auto rounded-xl border border-ink/10 bg-ink/5 p-4 font-mono text-xs leading-relaxed text-fg-70">
                {state.script.content}
              </pre>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleCopy()}>
                  <Copy aria-hidden="true" />
                  复制全文
                </Button>
                <Button variant="secondary" asChild>
                  <a href={`/s/${encodeURIComponent(code)}?download=1`} download>
                    <Download aria-hidden="true" />
                    下载 .js
                  </a>
                </Button>
                <Button variant="ghost" asChild>
                  <a href={`/s/${encodeURIComponent(code)}`} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" />
                    原始地址
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
