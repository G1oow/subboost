import * as React from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { createApiClient } from "../lib/api-client";

export type TokenGateProps = {
  onAuthenticated: (token: string) => void;
};

export function TokenGate({ onAuthenticated }: TokenGateProps) {
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const client = createApiClient({
        getToken: () => token.trim(),
        onUnauthorized: () => {},
      });
      await client.get("/api/state");
      onAuthenticated(token.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("Unauthorized") || !message ? "访问 token 无效" : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page">
      <div className="w-full max-w-md animate-rise">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-ink/10 bg-ink/5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105">
            <KeyRound className="h-7 w-7 text-indigo-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold mt-4 text-fg">SubBoost Lite</h1>
          <p className="text-fg-50 mt-2">请输入管理访问 token 以继续</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="animate-rise stagger-2 bg-ink/5 backdrop-blur-sm border border-ink/10 rounded-2xl p-6 space-y-4"
        >
          <PasswordField
            label="访问 token"
            placeholder="ADMIN_TOKEN"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            error={error || undefined}
            className="h-12"
          />
          <Button type="submit" disabled={loading || !token.trim()} className="h-12 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            进入管理页
          </Button>
          <p className="text-xs text-fg-45 leading-relaxed">
            token 仅保存在本机浏览器 localStorage，不会写入 URL、Cookie 或页面 HTML。
          </p>
        </form>
      </div>
    </div>
  );
}

