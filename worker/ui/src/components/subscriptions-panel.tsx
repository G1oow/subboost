import * as React from "react";
import { Check, Copy, Link2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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

export type SubscriptionUpdatePatch = {
  name?: string;
  sourceIds?: string[];
};

export type SubscriptionsPanelProps = {
  state: AppState;
  onCreate: (input: { name: string; sourceIds: string[] }) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** 修改已创建订阅的名称与所含源（链接不变） */
  onUpdate?: (id: string, patch: SubscriptionUpdatePatch) => Promise<void>;
};

export function SubscriptionsPanel({
  state,
  onCreate,
  onRotate,
  onDelete,
  onUpdate,
}: SubscriptionsPanelProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const sourceNameById = React.useMemo(
    () => new Map(state.sources.map((source) => [source.id, source.name])),
    [state.sources]
  );

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setSelected([]);
    setError("");
    setOpen(true);
  };

  const openEdit = (subscription: SubscriptionDto) => {
    setEditingId(subscription.id);
    setName(subscription.name);
    setSelected(subscription.sourceIds);
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
      if (editingId) {
        if (!onUpdate) {
          setError("当前版本不支持修改订阅。");
          return;
        }
        await onUpdate(editingId, { name: name.trim(), sourceIds: selected });
        toast({ variant: "success", title: "已更新订阅", description: "链接保持不变，下次访问即按新源生成。" });
      } else {
        await onCreate({ name: name.trim(), sourceIds: selected });
        toast({ variant: "success", title: "已创建订阅" });
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
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

  const renderBoundSources = (subscription: SubscriptionDto) => {
    if (subscription.sourceIds.length === 0) {
      return <Badge variant="secondary">全部启用源</Badge>;
    }
    const names = subscription.sourceIds.map((id) => sourceNameById.get(id) ?? "已删除的源");
    const visible = names.slice(0, 2);
    return (
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((item, index) => (
          <Badge key={`${item}-${index}`} variant="outline" className="max-w-[120px] truncate">
            {item}
          </Badge>
        ))}
        {names.length > visible.length ? (
          <Badge variant="secondary">+{names.length - visible.length}</Badge>
        ) : null}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>订阅链接</CardTitle>
          <p className="text-xs text-fg-45">随时修改名称或所含源，链接本身不会变化。</p>
        </div>
        <Button onClick={openCreate} disabled={state.sources.length === 0}>
          <Plus aria-hidden="true" />
          创建订阅
        </Button>
      </CardHeader>
      <CardContent>
        {state.sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 px-4 py-10 text-center">
            <Link2 aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-fg-35" />
            <p className="text-sm text-fg-50">请先添加源，再创建订阅链接。</p>
          </div>
        ) : state.subscriptions.length === 0 ? (
          <p className="text-sm text-fg-50">还没有订阅，点击「创建订阅」生成一条链接。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>所含源</TableHead>
                <TableHead>链接</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.subscriptions.map((subscription, index) => (
                <TableRow
                  key={subscription.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <TableCell className="font-medium text-fg">{subscription.name}</TableCell>
                  <TableCell>{renderBoundSources(subscription)}</TableCell>
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
                      {onUpdate ? (
                        <IconButton
                          label={`修改 ${subscription.name} 的源`}
                          variant="ghost"
                          onClick={() => openEdit(subscription)}
                        >
                          <Pencil aria-hidden="true" />
                        </IconButton>
                      ) : null}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "修改订阅" : "创建订阅"}</DialogTitle>
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
              <p className="text-xs text-fg-45">
                不选择任何源表示使用全部启用源；勾选后只聚合这些源。
              </p>
              <div className="grid gap-2">
                {state.sources.map((source, index) => {
                  const checked = selected.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      aria-pressed={checked}
                      className={cn(
                        "animate-fade-in-up flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200",
                        checked
                          ? "border-primary-500/50 bg-primary-500/20 text-fg"
                          : "border-ink/10 bg-ink/5 text-fg-70 hover:-translate-y-px hover:bg-ink/10"
                      )}
                      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                            checked ? "border-primary-500 bg-primary-500/70" : "border-ink/25"
                          )}
                        >
                          {checked ? <Check className="h-3 w-3 text-fg" /> : null}
                        </span>
                        {source.name}
                      </span>
                      <span className="text-xs text-fg-45">
                        {source.kind === "remote" ? "远程" : "手动"}
                        {source.enabled ? "" : " · 已停用"}
                      </span>
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
                {saving ? "保存中…" : editingId ? "保存修改" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
