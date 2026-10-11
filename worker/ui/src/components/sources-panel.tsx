import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@subboost/ui/components/ui/select";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@subboost/ui/components/ui/table";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { useToast } from "@subboost/ui/components/ui/toaster";
import type { AppState, SourceDto, SourceInput, SourceKind } from "../lib/types";

export type SourcesPanelProps = {
  state: AppState;
  onSave: (sources: SourceInput[]) => Promise<void>;
};

type Draft = {
  id?: string;
  name: string;
  kind: SourceKind;
  url: string;
  manualText: string;
  userAgent: string;
  enabled: boolean;
};

function emptyDraft(): Draft {
  return { name: "", kind: "remote", url: "", manualText: "", userAgent: "", enabled: true };
}

function toDraft(source: SourceDto): Draft {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    url: source.url ?? "",
    manualText: source.manualText ?? "",
    userAgent: source.userAgent ?? "",
    enabled: source.enabled,
  };
}

function toInput(source: SourceDto): SourceInput {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    ...(source.kind === "remote" ? { url: source.url } : { manualText: source.manualText }),
    enabled: source.enabled,
    ...(source.userAgent ? { userAgent: source.userAgent } : {}),
  };
}

export function SourcesPanel({ state, onSave }: SourcesPanelProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft());
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const statusBySource = new Map((state.status?.sources ?? []).map((item) => [item.sourceId, item]));

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditingIndex(null);
    setError("");
    setOpen(true);
  };

  const openEdit = (source: SourceDto) => {
    setDraft(toDraft(source));
    setEditingIndex(state.sources.findIndex((item) => item.id === source.id));
    setError("");
    setOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!draft.name.trim()) {
      setError("请填写源名称");
      return;
    }
    if (draft.kind === "remote" && !draft.url.trim()) {
      setError("请填写订阅 URL");
      return;
    }
    if (draft.kind === "manual" && !draft.manualText.trim()) {
      setError("请填写节点文本");
      return;
    }

    const input: SourceInput = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      kind: draft.kind,
      enabled: draft.enabled,
      ...(draft.userAgent.trim() ? { userAgent: draft.userAgent.trim() } : {}),
      ...(draft.kind === "remote" ? { url: draft.url.trim() } : { manualText: draft.manualText }),
    };

    const next = state.sources.map(toInput);
    if (editingIndex === null) next.push(input);
    else next[editingIndex] = input;

    setSaving(true);
    try {
      await onSave(next);
      toast({ variant: "success", title: "已保存源" });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (source: SourceDto) => {
    const confirmed = await confirmDialog({
      title: "删除源？",
      description: `删除「${source.name}」会同时移除它的节点快照，引用它的订阅将重新生成。`,
      confirmText: "删除",
      variant: "destructive",
    });
    if (!confirmed) return;
    const next = state.sources.filter((item) => item.id !== source.id).map(toInput);
    try {
      await onSave(next);
      toast({ variant: "success", title: "已删除源" });
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
        <CardTitle>源管理</CardTitle>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" />
          添加源
        </Button>
      </CardHeader>
      <CardContent>
        {state.sources.length === 0 ? (
          <p className="text-sm text-fg-50">还没有源，先添加一个上游订阅或手动节点。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>最近节点数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.sources.map((source) => {
                const status = statusBySource.get(source.id);
                return (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium text-fg">{source.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{source.kind === "remote" ? "远程" : "手动"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={source.enabled ? "success" : "outline"}>
                        {source.enabled ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>{status?.nodeCount ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <IconButton label={`编辑 ${source.name}`} variant="ghost" onClick={() => openEdit(source)}>
                          <Pencil aria-hidden="true" />
                        </IconButton>
                        <IconButton label={`删除 ${source.name}`} variant="ghost" onClick={() => handleDelete(source)}>
                          <Trash2 aria-hidden="true" />
                        </IconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingIndex === null ? "添加源" : "编辑源"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="名称" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="例如：机场 A"
              />
            </FormField>

            <FormField label="类型" required>
              <Select
                value={draft.kind}
                onValueChange={(value) => setDraft({ ...draft, kind: value as SourceKind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">远程订阅 URL</SelectItem>
                  <SelectItem value="manual">手动节点文本</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {draft.kind === "remote" ? (
              <FormField label="订阅 URL" required description="仅支持 http/https，且必须通过 SSRF 校验。">
                <Input
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                  placeholder="https://example.com/sub?token=..."
                />
              </FormField>
            ) : (
              <FormField label="节点文本" required description="每行一个节点链接，最多 512 KiB。">
                <Textarea
                  value={draft.manualText}
                  onChange={(event) => setDraft({ ...draft, manualText: event.target.value })}
                  className="min-h-[180px] font-mono text-xs"
                  placeholder="ss://..."
                />
              </FormField>
            )}

            <FormField label="User-Agent" description="可选，留空使用默认 mihomo UA。">
              <Input
                value={draft.userAgent}
                onChange={(event) => setDraft({ ...draft, userAgent: event.target.value })}
                placeholder="mihomo/1.19.24"
              />
            </FormField>

            <SwitchField
              label="启用该源"
              description="停用后刷新与订阅生成都会跳过它。"
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
            />

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
                {saving ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

