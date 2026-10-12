import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { ConfigPanel } from "./config-panel";
import { SourcesPanel } from "./sources-panel";
import { StatusPanel } from "./status-panel";
import { SubscriptionsPanel } from "./subscriptions-panel";
import { TokenGate } from "./token-gate";
import type { AppState } from "../lib/types";

const STATE: AppState = {
  app: { name: "SubBoost Lite", version: "0.1.0" },
  sources: [
    {
      id: "s1",
      name: "机场 A",
      kind: "remote",
      url: "https://example.com/sub?token=secret",
      enabled: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "s2",
      name: "手动节点",
      kind: "manual",
      manualText: "ss://abc",
      enabled: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  subscriptions: [
    {
      id: "sub1",
      name: "默认订阅",
      sourceIds: [],
      link: "https://worker.example.com/sub/tokenvalue",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  config: { mixedPort: 7897 },
  configIsDefault: true,
  status: {
    lastRunAt: "2026-10-12T00:00:00.000Z",
    lastTrigger: "cron",
    durationMs: 1234,
    sources: [{ sourceId: "s1", ok: true, nodeCount: 12 }],
    subscriptions: [{ subscriptionId: "sub1", ok: true, nodeCount: 12 }],
  },
};

const noopAsync = async () => {};

beforeEach(() => {
  // AppShell 的初始主题读取需要 document，这里提供最小替身
  const documentStub = {
    documentElement: { getAttribute: () => "dark", setAttribute: () => {} },
    querySelector: () => null,
  };
  vi.stubGlobal("document", documentStub);
});

describe("admin UI rendering", () => {
  it("renders the token gate without embedding any secret", () => {
    const html = renderToStaticMarkup(React.createElement(TokenGate, { onAuthenticated: () => {} }));
    expect(html).toContain("访问 token");
    expect(html).not.toContain("ADMIN_TOKEN=");
    expect(html).not.toContain("ENCRYPTION_KEY=");
  });

  it("renders the app shell with the app name and version", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AppShell,
        { title: STATE.app.name, version: STATE.app.version, onLogout: () => {} },
        React.createElement("p", null, "content")
      )
    );
    expect(html).toContain("SubBoost Lite");
    expect(html).toContain("v0.1.0");
    expect(html).toContain("content");
  });

  it("renders the status panel with source and subscription results", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusPanel, { state: STATE, onRefresh: noopAsync, refreshing: false })
    );
    expect(html).toContain("刷新状态");
    expect(html).toContain("机场 A");
    expect(html).toContain("默认订阅");
    expect(html).toContain("12");
  });

  it("renders the sources panel with both source kinds", () => {
    const html = renderToStaticMarkup(
      React.createElement(SourcesPanel, { state: STATE, onSave: noopAsync })
    );
    expect(html).toContain("源管理");
    expect(html).toContain("机场 A");
    expect(html).toContain("手动节点");
    expect(html).toContain("远程");
    expect(html).toContain("手动");
  });

  it("renders the subscriptions panel with the truncated link", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionsPanel, {
        state: STATE,
        onCreate: noopAsync,
        onRotate: noopAsync,
        onDelete: noopAsync,
      })
    );
    expect(html).toContain("订阅链接");
    expect(html).toContain("默认订阅");
    expect(html).toContain("https://worker.example.com/sub/tokenvalue");
  });

  it("renders the config panel with the JSON text and default hint", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfigPanel, { state: STATE, onSave: noopAsync, onReset: noopAsync })
    );
    expect(html).toContain("生成配置");
    expect(html).toContain("当前为默认配置");
    expect(html).toContain("mixedPort");
  });
});

