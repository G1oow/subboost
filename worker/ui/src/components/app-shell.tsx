import * as React from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { applyTheme, getCurrentTheme, persistTheme, type ThemeName } from "@subboost/ui/theme/theme";

export type AppShellProps = {
  title: string;
  version: string;
  onLogout: () => void;
  children?: React.ReactNode;
};

export function AppShell({ title, version, onLogout, children }: AppShellProps) {
  const [theme, setTheme] = React.useState<ThemeName>(() => getCurrentTheme());

  const toggleTheme = () => {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  };

  return (
    <div className="min-h-screen bg-page text-fg">
      <header className="border-b border-ink/10 bg-header backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-fg">{title}</h1>
            <span className="text-xs text-fg-45">v{version}</span>
          </div>
          <div className="flex items-center gap-2">
            <IconButton label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} variant="ghost" onClick={toggleTheme}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </IconButton>
            <Button variant="ghost" onClick={onLogout}>
              <LogOut aria-hidden="true" />
              退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
