import * as React from "react";
import { LogOut, Moon, RefreshCw, Sun } from "lucide-react";
import { BrandMark } from "@subboost/ui/components/ui/brand-mark";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { LoadingButton } from "@subboost/ui/motion/loading-button";
import { SegmentedControl } from "@subboost/ui/motion/segmented-control";
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

/** 导航滑块共享布局的命名空间，全局唯一即可 */
const NAV_PILL_GROUP = "app-nav";

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

  const navOptions = React.useMemo(
    () =>
      (navItems ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(typeof item.badge === "number" && item.badge > 0 ? { badge: item.badge } : {}),
      })),
    [navItems]
  );

  return (
    <div className="min-h-screen bg-page text-fg">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-header backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 shrink-0 shadow-(--btn-primary-shadow) transition-transform duration-300 hover:rotate-6" />
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold text-fg">{title}</h1>
              <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[11px] text-fg-45">
                v{version}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? (
              <LoadingButton
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                loading={refreshing}
                loadingLabel="刷新中…"
              >
                <RefreshCw aria-hidden="true" />
                刷新
              </LoadingButton>
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

        {navOptions.length > 0 ? (
          <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-6">
            <SegmentedControl
              label="主导航"
              layoutGroupId={NAV_PILL_GROUP}
              options={navOptions}
              activeId={activeNav ?? navOptions[0]?.id ?? ""}
              onSelect={(id) => onNavigate?.(id)}
              className="w-full sm:w-auto"
              optionClassName="flex-1 justify-center px-3 py-2 sm:flex-none"
            />
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* key 换页时重新挂载，触发一次 pageIn 入场；动画只动 opacity/translate */}
        <div key={activeNav ?? "page"} className={cn("page-content animate-page-in space-y-6")}>
          {children}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-fg-35 sm:px-6">
        SubBoost Lite · Cloudflare Workers + KV
      </footer>
    </div>
  );
}
