import * as React from "react";
import { Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@subboost/ui/components/ui/table";
import { useToast } from "@subboost/ui/components/ui/toaster";
import { copyTextToClipboard } from "@subboost/ui/lib/clipboard";
import { cn } from "@subboost/ui/lib/utils";
import type { AppState, SubscriptionDto } from "../lib/types";

export type SubscriptionsPanelProps = {
  state: AppState;
  onCreate: (input: { name: string; sourceIds: string[] }) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function SubscriptionsPanel({ state, onCreate, onRotate, onDelete }: SubscriptionsPanelProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const openCreate = () => {
    setName("");
    setSelected([]);
    setError("");
    setOpen(true);
  };

  const toggleSource = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("请填写订阅名称");
      return;
    }
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), sourceIds: selected });
      toast({ variant: "success", title: "已创建订阅" });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (subscription: SubscriptionDto) => {
    const ok = await copyTextToClipboard(subscription.link);
    if (!ok) {
      toast({ variant: "warning", title: "复制失败", description: "请手动选择链接复制。" });
      return;
    }
    setCopiedId(subscription.id);
    window.setTimeout(() => setCopiedId((current) => (current === subscription.id ? null : current)), 1500);
  };

  const handleRotate = async (subscription: SubscriptionDto) => {
    const confirmed = await confirmDialog({
      title: "轮换订阅 token？",
      description: `「${subscription.name}」的旧链接会立即失效，需要把新链接重新导入客户端。`,
      confirmText: "轮换",
      variant: "warning",
    });
    if (!confirmed) return;
    try {
      await onRotate(subscription.id);
      toast({ variant: "success", title: "已轮换 token" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "轮换失败",
        description: err instanceof Error ? err.message : "轮换失败",
      });
    }
  };

  const handleDelete = async (subscription: SubscriptionDto) => {
    const confirmed = await confirmDialog({
      title: "删除订阅？",
      description: `删除「${subscription.name}」后其订阅链接立即失效，且不可恢复。`,
      confirmText: "删除",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await onDelete(subscription.id);
      toast({ variant: "success", title: "已删除订阅" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: err instanceof Error ? err.message : "删除失败",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>订阅链接</CardTitle>
        <Button onClick={openCreate} disabled={state.sources.length === 0}>
          <Plus aria-hidden="true" />
          创建订阅
        </Button>
      </CardHeader>
      <CardContent>
        {state.sources.length === 0 ? (
          <p className="text-sm text-fg-50">请先添加源，再创建订阅链接。</p>
        ) : state.subscriptions.length === 0 ? (
          <p className="text-sm text-fg-50">还没有订阅，点击「创建订阅」生成一条链接。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>源数量</TableHead>
                <TableHead>链接</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium text-fg">{subscription.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {subscription.sourceIds.length === 0 ? "全部启用源" : subscription.sourceIds.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs text-fg-50">
                    {subscription.link}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton label={`复制 ${subscription.name} 链接`} variant="ghost" onClick={() => handleCopy(subscription)}>
                        <Check
                          aria-hidden="true"
                          className={cn(copiedId === subscription.id ? "text-emerald-400" : "hidden")}
                        />
                        <Copy
                          aria-hidden="true"
                          className={cn(copiedId === subscription.id ? "hidden" : undefined)}
                        />
                      </IconButton>
                      <IconButton label={`轮换 ${subscription.name} token`} variant="ghost" onClick={() => handleRotate(subscription)}>
                        <RefreshCw aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`删除 ${subscription.name}`} variant="ghost" onClick={() => handleDelete(subscription)}>
                        <Trash2 aria-hidden="true" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>创建订阅</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="名称" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：默认订阅"
              />
            </FormField>

            <div className="space-y-2">
              <p className="text-sm font-medium text-fg-80">绑定源</p>
              <p className="text-xs text-fg-45">不选择任何源表示使用全部启用源。</p>
              <div className="grid gap-2">
                {state.sources.map((source) => {
                  const checked = selected.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                        checked
                          ? "border-primary-500/50 bg-primary-500/20 text-fg"
                          : "border-ink/10 bg-ink/5 text-fg-70 hover:bg-ink/10"
                      )}
                    >
                      <span>{source.name}</span>
                      <span className="text-xs text-fg-45">{source.kind === "remote" ? "远程" : "手动"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "创建中…" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
