import { flushSync } from "react-dom";

/**
 * 页面切换过渡工具。
 *
 * 支持 View Transitions API 的浏览器会做真正的交叉过渡（旧页淡出、新页淡入，两层重叠），
 * 不支持的浏览器直接同步执行更新，由 CSS 的 animate-page-in 兜底。
 */

type ViewTransitionLike = {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  ready: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike;
};

export function supportsViewTransition(): boolean {
  if (typeof document === "undefined") return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === "function";
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 在 View Transition 中执行一次状态更新。
 *
 * `update` 里只需触发 React 状态变化；用 flushSync 让 React 在过渡回调内同步完成
 * DOM 提交，过渡才能正确捕捉到「旧快照 / 新快照」。
 */
export function runPageTransition(update: () => void): void {
  if (!supportsViewTransition() || prefersReducedMotion()) {
    update();
    return;
  }

  const doc = document as DocumentWithViewTransition;
  const transition = doc.startViewTransition?.(() => {
    flushSync(update);
  });

  // 连续切换导航时过渡会被跳过，此时 ready/finished 会 reject，忽略即可
  transition?.finished.catch(() => undefined);
  transition?.ready.catch(() => undefined);
}
