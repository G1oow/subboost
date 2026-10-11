import * as React from "react";
import { Loader2 } from "lucide-react";
import { ConfirmDialogHost } from "@subboost/ui/components/ui/confirm-dialog";
import { useToast } from "@subboost/ui/components/ui/toaster";
import { AppShell } from "./components/app-shell";
import { ConfigPanel } from "./components/config-panel";
import { SourcesPanel } from "./components/sources-panel";
import { StatusPanel } from "./components/status-panel";
import { SubscriptionsPanel } from "./components/subscriptions-panel";
import { TokenGate } from "./components/token-gate";
import { clearAdminToken, readAdminToken, writeAdminToken } from "./lib/admin-token";
import { createApiClient } from "./lib/api-client";
import type { AppState, SourceInput, StatusRecord } from "./lib/types";

type SubscriptionResponse = { subscription: AppState["subscriptions"][number] };
type SourcesResponse = { sources: AppState["sources"] };
type StatusResponse = { status: StatusRecord };
type ConfigResponse = { config: Record<string, unknown>; configIsDefault: boolean };

export function App() {
  const { toast } = useToast();
  const [token, setToken] = React.useState<string | null>(() => readAdminToken());
  const [state, setState] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const handleUnauthorized = React.useCallback(() => {
    clearAdminToken();
    setToken(null);
    setState(null);
  }, []);

  const client = React.useMemo(
    () =>
      createApiClient({
        getToken: () => token,
        onUnauthorized: handleUnauthorized,
      }),
    [token, handleUnauthorized]
  );

  const loadState = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await client.get<AppState>("/api/state");
      setState(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      toast({ variant: "destructive", title: "加载失败", description: message });
    } finally {
      setLoading(false);
    }
  }, [client, toast]);

  React.useEffect(() => {
    if (token) void loadState();
  }, [token, loadState]);

  const handleAuthenticated = (nextToken: string) => {
    writeAdminToken(nextToken);
    setToken(nextToken);
  };

  const handleLogout = () => {
    clearAdminToken();
    setToken(null);
    setState(null);
  };

  const handleSaveSources = async (sources: SourceInput[]) => {
    const result = await client.send<SourcesResponse>("PUT", "/api/sources", { sources });
    setState((current) => (current ? { ...current, sources: result.sources } : current));
    void loadState();
  };

  const handleCreateSubscription = async (input: { name: string; sourceIds: string[] }) => {
    const result = await client.send<SubscriptionResponse>("POST", "/api/subscriptions", input);
    setState((current) =>
      current ? { ...current, subscriptions: [...current.subscriptions, result.subscription] } : current
    );
  };

  const handleRotateSubscription = async (id: string) => {
    const result = await client.send<SubscriptionResponse>(
      "POST",
      `/api/subscriptions/${encodeURIComponent(id)}/rotate`
    );
    setState((current) =>
      current
        ? {
            ...current,
            subscriptions: current.subscriptions.map((item) =>
              item.id === id ? result.subscription : item
            ),
          }
        : current
    );
  };

  const handleDeleteSubscription = async (id: string) => {
    await client.send<void>("DELETE", `/api/subscriptions/${encodeURIComponent(id)}`);
    setState((current) =>
      current
        ? { ...current, subscriptions: current.subscriptions.filter((item) => item.id !== id) }
        : current
    );
  };

  const handleSaveConfig = async (config: Record<string, unknown>) => {
    const result = await client.send<ConfigResponse>("PUT", "/api/config", config);
    setState((current) =>
      current ? { ...current, config: result.config, configIsDefault: result.configIsDefault } : current
    );
  };

  const handleResetConfig = async () => {
    const result = await client.send<ConfigResponse>("DELETE", "/api/config");
    setState((current) =>
      current ? { ...current, config: result.config, configIsDefault: result.configIsDefault } : current
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await client.send<StatusResponse>("POST", "/api/refresh");
      setState((current) => (current ? { ...current, status: result.status } : current));
      toast({ variant: "success", title: "刷新完成" });
    } finally {
      setRefreshing(false);
    }
  };

  if (!token) return <TokenGate onAuthenticated={handleAuthenticated} />;

  return (
    <>
      <AppShell
        title={state?.app.name ?? "SubBoost Lite"}
        version={state?.app.version ?? ""}
        onLogout={handleLogout}
      >
        {loading && !state ? (
          <div className="flex items-center justify-center py-24 text-fg-50">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            加载中…
          </div>
        ) : state ? (
          <>
            <StatusPanel state={state} onRefresh={handleRefresh} refreshing={refreshing} />
            <SourcesPanel state={state} onSave={handleSaveSources} />
            <SubscriptionsPanel
              state={state}
              onCreate={handleCreateSubscription}
              onRotate={handleRotateSubscription}
              onDelete={handleDeleteSubscription}
            />
            <ConfigPanel state={state} onSave={handleSaveConfig} onReset={handleResetConfig} />
          </>
        ) : (
          <div className="py-24 text-center text-fg-50">加载失败，请重新输入 token。</div>
        )}
      </AppShell>
      <ConfirmDialogHost />
    </>
  );
}
