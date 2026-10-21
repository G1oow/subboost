import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, runPageTransition, supportsViewTransition } from "./view-transition";

type TransitionStub = {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  ready: Promise<void>;
  skipTransition: () => void;
};

function stubDocument(options: {
  startViewTransition?: (callback: () => void | Promise<void>) => TransitionStub;
}): void {
  vi.stubGlobal("document", {
    ...("startViewTransition" in options ? { startViewTransition: options.startViewTransition } : {}),
  });
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: reduced }),
  });
}

const settledTransition: TransitionStub = {
  finished: Promise.resolve(),
  updateCallbackDone: Promise.resolve(),
  ready: Promise.resolve(),
  skipTransition: () => {},
};

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("view transition helper", () => {
  it("detects browser support for the View Transitions API", () => {
    stubDocument({ startViewTransition: () => settledTransition });
    expect(supportsViewTransition()).toBe(true);

    stubDocument({});
    expect(supportsViewTransition()).toBe(false);
  });

  it("treats a missing document or matchMedia as no-op safe", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(supportsViewTransition()).toBe(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reports reduced motion preference and survives a throwing matchMedia", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);

    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("boom");
      },
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("wraps the update in a view transition when supported", () => {
    const calls: string[] = [];
    const transition: TransitionStub = { ...settledTransition };
    stubDocument({
      startViewTransition: (callback) => {
        calls.push("start");
        void callback();
        return transition;
      },
    });

    runPageTransition(() => calls.push("update"));
    expect(calls).toEqual(["start", "update"]);
  });

  it("runs the update directly when the API is unsupported", () => {
    stubDocument({});
    const update = vi.fn();

    runPageTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("skips the transition when the user prefers reduced motion", () => {
    const startViewTransition = vi.fn(() => settledTransition);
    stubDocument({ startViewTransition });
    stubMatchMedia(true);
    const update = vi.fn();

    runPageTransition(update);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("swallows rejection from an interrupted transition", async () => {
    const rejected = Promise.reject(new Error("interrupted"));
    rejected.catch(() => undefined);
    stubDocument({
      startViewTransition: (callback) => {
        void callback();
        return { ...settledTransition, ready: rejected, finished: rejected };
      },
    });

    expect(() => runPageTransition(() => {})).not.toThrow();
    await Promise.resolve();
  });
});
