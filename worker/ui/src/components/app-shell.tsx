import * as React from "react";
import { LogOut, Moon, RefreshCw, Sun, Zap } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { cn } from "@subboost/ui/lib/utils";
import { applyTheme, getCurrentTheme, persistTheme, type ThemeName } from "@subboost/ui/theme/theme";

export type AppNavItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** 右侧小徽标，例如未读/数量提示 */
  badge?: number;
};

export type AppShellProps = {
  title: string;
  version: string;
  onLogout: () => void;
  children?: React.ReactNode;
  navItems?: AppNavItem[];
  activeNav?: string;
  onNavigate?: (id: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function AppShell({
  title,
  version,
  onLogout,
  children,
  navItems,
  activeNav,
  onNavigate,
  onRefresh,
  refreshing = false,
}: AppShellProps) {
  const [theme, setTheme] = React.useState<ThemeName>(() => getCurrentTheme());

  const toggleTheme = () => {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  };

  return (
    <div className="min-h-screen bg-page text-fg">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-header backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-indigo-500 text-btn-primary-fg shadow-(--btn-primary-shadow) transition-transform duration-300 hover:rotate-6"
            >
              <Zap className="h-4 w-4" />
            </span>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold text-fg">{title}</h1>
              <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[11px] text-fg-45">
                v{version}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? (
              <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
                {refreshing ? "刷新中…" : "刷新"}
              </Button>
            ) : null}
            <IconButton
              label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
              variant="ghost"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </IconButton>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut aria-hidden="true" />
              退出
            </Button>
          </div>
        </div>

        {navItems && navItems.length > 0 ? (
          <nav
            aria-label="主导航"
            className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 pb-2 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map((item) => {
              const active = item.id === activeNav;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate?.(item.id)}
                  className={cn(
                    "group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-300",
                    active
                      ? "bg-primary-500/15 text-fg shadow-(--btn-outline-shadow)"
                      : "text-fg-55 hover:-translate-y-px hover:bg-ink/5 hover:text-fg-80"
                  )}
                >
                  {item.icon ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 items-center justify-center transition-transform duration-300",
                        active ? "scale-110" : "group-hover:scale-110"
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="whitespace-nowrap">{item.label}</span>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="rounded-full bg-ink/10 px-1.5 text-[10px] leading-4 text-fg-60">
                      {item.badge}
                    </span>
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-primary-500 transition-all duration-300",
                      active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
                    )}
                  />
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div key={activeNav ?? "page"} className="animate-page-in space-y-6">
          {children}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-fg-35 sm:px-6">
        SubBoost Lite · Cloudflare Workers + KV
      </footer>
    </div>
  );
}
