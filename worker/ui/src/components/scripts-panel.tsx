import * as React from "react";
import {
  Check,
  Copy,
  Download,
  Eye,
  FileCode,
  Link2Off,
  Pencil,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@subboost/ui/components/ui/table";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { useToast } from "@subboost/ui/components/ui/toaster";
import { copyTextToClipboard } from "@subboost/ui/lib/clipboard";
import { cn } from "@subboost/ui/lib/utils";
import { formatBytes, formatDateTime } from "../lib/format";
import type { AppState, ExtensionScriptDto } from "../lib/types";

export type ScriptImportInput = {
  name: string;
  description?: string;
  content: string;
};

export type ScriptUpdatePatch = {
  name?: string;
  description?: string;
  enabled?: boolean;
  content?: string;
};

export type ScriptsPanelProps = {
  state: AppState;
  /** 导入一个新脚本（文件或粘贴文本） */
  onCreate: (input: ScriptImportInput) => Promise<void>;
  onUpdate: (id: string, patch: ScriptUpdatePatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** 生成分享链接；已分享时等同轮换，旧链接立即失效 */
  onShare: (id: string) => Promise<void>;
  onUnshare: (id: string) => Promise<void>;
  /** 按需拉取脚本正文（列表里不携带全文） */
  onLoadContent: (id: string) => Promise<string>;
};

function triggerDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith(".js") ? fileName : `${fileName}.js`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ScriptsPanel({
  state,
  onCreate,
  onUpdate,
  onDelete,
  onShare,
  onUnshare,
  onLoadContent,
}: ScriptsPanelProps) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [previewContent, setPreviewContent] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const previewScript = state.scripts.find((script) => script.id === previewId) ?? null;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setContent("");
    setError("");
  };

  const openImport = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = async (script: ExtensionScriptDto) => {
    setEditingId(script.id);
    setName(script.name);
    setDescription(script.description ?? "");
    setContent("");
    setError("");
    setFormOpen(true);
    try {
      setContent(await onLoadContent(script.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取脚本失败");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setContent(text);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      setError("");
    } catch {
      setError("读取文件失败，请重试或直接粘贴脚本内容");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请填写脚本名称");
      return;
    }
    if (!content.trim()) {
      setError("请选择脚本文件或粘贴脚本内容");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name: trimmedName,
          description: description.trim(),
          content,
        });
        toast({ variant: "success", title: "已保存扩展脚本" });
      } else {
        await onCreate({
          name: trimmedName,
          description: description.trim() || undefined,
          content,
        });
        toast({ variant: "success", title: "已导入扩展脚本" });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async (script: ExtensionScriptDto) => {
    setPreviewId(script.id);
    setPreviewContent("");
    setPreviewLoading(true);
    try {
      setPreviewContent(await onLoadContent(script.id));
    } catch (err) {
      setPreviewId(null);
      toast({
        variant: "destructive",
        title: "读取脚本失败",
        description: err instanceof Error ? err.message : "读取脚本失败",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopyShareUrl = async (script: ExtensionScriptDto) => {
    if (!script.shareUrl) return;
    const ok = await copyTextToClipboard(script.shareUrl);
    if (!ok) {
      toast({ variant: "warning", title: "复制失败", description: "请手动选择链接复制。" });
      return;
    }
    setCopiedId(script.id);
    window.setTimeout(() => setCopiedId((current) => (current === script.id ? null : current)), 1500);
  };

  const handleToggleEnabled = async (script: ExtensionScriptDto, enabled: boolean) => {
    try {
      await onUpdate(script.id, { enabled });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "操作失败",
        description: err instanceof Error ? err.message : "操作失败",
      });
    }
  };

  const handleShare = async (script: ExtensionScriptDto) => {
    const rotating = Boolean(script.shareUrl);
    if (rotating) {
      const confirmed = await confirmDialog({
        title: "轮换分享链接？",
        description: `「${script.name}」的旧分享链接会立即失效，已导入的设备需要重新导入新链接。`,
        confirmText: "轮换",
        variant: "warning",
      });
      if (!confirmed) return;
    }
    try {
      await onShare(script.id);
      toast({ variant: "success", title: rotating ? "已轮换分享链接" : "已生成分享链接" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "生成分享链接失败",
        description: err instanceof Error ? err.message : "生成分享链接失败",
      });
    }
  };

  const handleUnshare = async (script: ExtensionScriptDto) => {
    const confirmed = await confirmDialog({
      title: "关闭分享？",
      description: `关闭后「${script.name}」的分享链接立即失效，已导入的设备不受影响。`,
      confirmText: "关闭分享",
      variant: "warning",
    });
    if (!confirmed) return;
    try {
      await onUnshare(script.id);
      toast({ variant: "success", title: "已关闭分享" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "关闭分享失败",
        description: err instanceof Error ? err.message : "关闭分享失败",
      });
    }
  };

  const handleDelete = async (script: ExtensionScriptDto) => {
    const confirmed = await confirmDialog({
      title: "删除扩展脚本？",
      description: `删除「${script.name}」后其分享链接立即失效，且不可恢复。`,
      confirmText: "删除",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await onDelete(script.id);
      toast({ variant: "success", title: "已删除扩展脚本" });
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
        <div className="space-y-1">
          <CardTitle>扩展脚本</CardTitle>
          <p className="text-xs text-fg-45">
            导入 Clash Verge Rev 扩展脚本（<code className="font-mono">main(config)</code>
            ），生成分享链接后可在任意设备拉取并导入。
          </p>
        </div>
        <Button onClick={openImport}>
          <Upload aria-hidden="true" />
          导入脚本
        </Button>
      </CardHeader>
      <CardContent>
        {state.scripts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 px-4 py-10 text-center">
            <FileCode aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-fg-35" />
            <p className="text-sm text-fg-50">还没有扩展脚本，点击「导入脚本」上传 .js 文件或粘贴内容。</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>体积</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>分享链接</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.scripts.map((script, index) => (
                <TableRow
                  key={script.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <TableCell className="max-w-[240px]">
                    <p className="truncate font-medium text-fg">{script.name}</p>
                    {script.description ? (
                      <p className="truncate text-xs text-fg-45">{script.description}</p>
                    ) : null}
                    <p className="text-xs text-fg-35">更新于 {formatDateTime(script.updatedAt)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-fg-50">
                    {formatBytes(script.size)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={script.enabled}
                      onCheckedChange={(checked) => void handleToggleEnabled(script, checked)}
                      aria-label={`${script.enabled ? "停用" : "启用"} ${script.name}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    {script.shareUrl ? (
                      <div className="space-y-1">
                        <Badge variant="success">已分享</Badge>
                        <p className="truncate font-mono text-xs text-fg-50">{script.shareUrl}</p>
                      </div>
                    ) : (
                      <Badge variant="secondary">未分享</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label={`复制 ${script.name} 分享链接`}
                        variant="ghost"
                        disabled={!script.shareUrl}
                        onClick={() => void handleCopyShareUrl(script)}
                      >
                        <Check
                          aria-hidden="true"
                          className={cn(copiedId === script.id ? "text-emerald-400" : "hidden")}
                        />
                        <Copy
                          aria-hidden="true"
                          className={cn(copiedId === script.id ? "hidden" : undefined)}
                        />
                      </IconButton>
                      <IconButton
                        label={`预览 ${script.name}`}
                        variant="ghost"
                        onClick={() => void openPreview(script)}
                      >
                        <Eye aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`编辑 ${script.name}`}
                        variant="ghost"
                        onClick={() => void openEdit(script)}
                      >
                        <Pencil aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={script.shareUrl ? `轮换 ${script.name} 分享链接` : `分享 ${script.name}`}
                        variant="ghost"
                        onClick={() => void handleShare(script)}
                      >
                        <Share2 aria-hidden="true" />
                      </IconButton>
                      {script.shareUrl ? (
                        <IconButton
                          label={`关闭 ${script.name} 的分享`}
                          variant="ghost"
                          onClick={() => void handleUnshare(script)}
                        >
                          <Link2Off aria-hidden="true" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label={`删除 ${script.name}`}
                        variant="ghost"
                        onClick={() => void handleDelete(script)}
                      >
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑扩展脚本" : "导入扩展脚本"}</DialogTitle>
            <DialogDescription>
              脚本原样保存，导入后在客户端侧执行；分享链接只提供只读访问。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="名称" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：Steam 直连与高倍率过滤"
              />
            </FormField>

            <FormField label="描述" description="可选，导入后用于区分不同脚本。">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：过滤 3.5x 以上节点，追加 Steam 直连规则"
              />
            </FormField>

            <FormField label="脚本文件" description="支持 .js / .txt，导入后仍可在下方直接编辑。">
              <input
                type="file"
                accept=".js,.mjs,.cjs,.txt,text/javascript,text/plain"
                onChange={(event) => void handleFileChange(event)}
                className="block w-full cursor-pointer rounded-xl border border-field-border bg-field px-4 py-2 text-xs text-fg-60 file:mr-3 file:rounded-lg file:border-0 file:bg-ink/10 file:px-3 file:py-1.5 file:text-xs file:text-fg"
              />
            </FormField>

            <FormField label="脚本内容" required description="必须包含 main(config) 入口。">
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
                placeholder={"function main(config) {\n  return config;\n}"}
                className="min-h-[240px] resize-y font-mono text-xs"
              />
            </FormField>

            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "保存中…" : editingId ? "保存修改" : "导入"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewScript)} onOpenChange={(open) => (open ? undefined : setPreviewId(null))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewScript?.name ?? "扩展脚本"}</DialogTitle>
            <DialogDescription>
              {previewScript
                ? `${formatBytes(previewScript.size)} · 更新于 ${formatDateTime(previewScript.updatedAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <p className="text-sm text-fg-50">读取中…</p>
          ) : (
            <pre className="max-h-[46vh] overflow-auto rounded-xl border border-ink/10 bg-ink/5 p-4 font-mono text-xs leading-relaxed text-fg-70">
              {previewContent}
            </pre>
          )}

          {previewScript?.shareUrl ? (
            <div className="space-y-2 rounded-xl border border-ink/10 bg-ink/5 p-3">
              <p className="text-xs font-medium text-fg-80">分享链接</p>
              <p className="break-all font-mono text-xs text-fg-50">{previewScript.shareUrl}</p>
              {previewScript.sharePageUrl ? (
                <p className="break-all font-mono text-xs text-fg-45">
                  分享页：{previewScript.sharePageUrl}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-fg-45">尚未分享，点击列表中的分享按钮即可生成公开链接。</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const ok = await copyTextToClipboard(previewContent);
                toast(
                  ok
                    ? { variant: "success", title: "已复制脚本内容" }
                    : { variant: "warning", title: "复制失败", description: "请手动选择内容复制。" }
                );
              }}
            >
              <Copy aria-hidden="true" />
              复制全文
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (previewScript) triggerDownload(previewScript.name, previewContent);
              }}
            >
              <Download aria-hidden="true" />
              下载脚本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
