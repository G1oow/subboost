import { describe, expect, it } from "vitest";
import {
  hasExtensionScriptMain,
  newScriptShareCode,
  normalizeScriptContent,
  normalizeScriptDescription,
  normalizeScriptName,
  normalizeShareCode,
  parseScriptCreateInput,
  parseScriptPatch,
  scriptByteLength,
  scriptDownloadFileName,
} from "./scripts";
import { MAX_SCRIPT_BYTES, MAX_SCRIPT_DESCRIPTION_LENGTH, MAX_SCRIPT_NAME_LENGTH } from "./types";

const SCRIPT = "function main(config) {\n  return config;\n}\n";

describe("hasExtensionScriptMain", () => {
  it("accepts the common main entry shapes", () => {
    expect(hasExtensionScriptMain(SCRIPT)).toBe(true);
    expect(hasExtensionScriptMain("const main = (config) => config;")).toBe(true);
    expect(hasExtensionScriptMain("module.exports = { main: (config) => config };")).toBe(true);
    expect(hasExtensionScriptMain("async function main(config) {}")).toBe(true);
  });

  it("rejects text without a main entry", () => {
    expect(hasExtensionScriptMain("console.log(1)")).toBe(false);
    expect(hasExtensionScriptMain("function mainline(config) {}")).toBe(false);
    expect(hasExtensionScriptMain("")).toBe(false);
  });
});

describe("scriptByteLength", () => {
  it("counts UTF-8 bytes", () => {
    expect(scriptByteLength("abc")).toBe(3);
    expect(scriptByteLength("节点")).toBe(6);
  });
});

describe("normalizeScriptName / normalizeScriptDescription", () => {
  it("trims valid values", () => {
    expect(normalizeScriptName("  Steam 直连 ")).toBe("Steam 直连");
    expect(normalizeScriptDescription("  过滤高倍率节点  ")).toBe("过滤高倍率节点");
    expect(normalizeScriptDescription(undefined)).toBe("");
  });

  it("rejects empty and oversized names", () => {
    expect(() => normalizeScriptName("")).toThrow(/名称长度/);
    expect(() => normalizeScriptName(123)).toThrow(/名称长度/);
    expect(() => normalizeScriptName("a".repeat(MAX_SCRIPT_NAME_LENGTH + 1))).toThrow(/名称长度/);
  });

  it("rejects oversized descriptions", () => {
    expect(() => normalizeScriptDescription("d".repeat(MAX_SCRIPT_DESCRIPTION_LENGTH + 1))).toThrow(
      /描述/
    );
  });
});

describe("normalizeScriptContent", () => {
  it("returns the original content", () => {
    expect(normalizeScriptContent(SCRIPT)).toBe(SCRIPT);
  });

  it("rejects empty, oversized and non-script content", () => {
    expect(() => normalizeScriptContent("   ")).toThrow(/不能为空/);
    expect(() => normalizeScriptContent(undefined)).toThrow(/不能为空/);
    expect(() => normalizeScriptContent(`${SCRIPT}\n//${"a".repeat(MAX_SCRIPT_BYTES)}`)).toThrow(
      /KiB/
    );
    expect(() => normalizeScriptContent("just some rules")).toThrow(/main\(config\)/);
  });
});

describe("parseScriptCreateInput", () => {
  it("normalizes fields and defaults enabled to true", () => {
    expect(
      parseScriptCreateInput({ name: " A ", description: " ", content: SCRIPT })
    ).toEqual({ name: "A", content: SCRIPT, enabled: true });
  });

  it("keeps an explicit description and disabled flag", () => {
    expect(
      parseScriptCreateInput({ name: "A", description: "desc", content: SCRIPT, enabled: false })
    ).toEqual({ name: "A", description: "desc", content: SCRIPT, enabled: false });
  });
});

describe("parseScriptPatch", () => {
  it("only includes provided fields", () => {
    expect(parseScriptPatch({})).toEqual({});
    expect(parseScriptPatch({ name: " B " })).toEqual({ name: "B" });
    expect(parseScriptPatch({ enabled: false })).toEqual({ enabled: false });
    expect(parseScriptPatch({ description: "" })).toEqual({ description: "" });
    expect(parseScriptPatch({ content: SCRIPT })).toEqual({ content: SCRIPT });
  });

  it("rejects a non-boolean enabled flag and invalid content", () => {
    expect(() => parseScriptPatch({ enabled: "yes" })).toThrow(/布尔值/);
    expect(() => parseScriptPatch({ content: "nope" })).toThrow(/main\(config\)/);
  });
});

describe("share code helpers", () => {
  it("generates unguessable base64url codes", () => {
    const first = newScriptShareCode();
    const second = newScriptShareCode();
    expect(first).not.toBe(second);
    expect(normalizeShareCode(first)).toBe(first);
  });

  it("rejects malformed codes", () => {
    expect(normalizeShareCode("short")).toBeNull();
    expect(normalizeShareCode("has space in code value")).toBeNull();
    expect(normalizeShareCode("a".repeat(129))).toBeNull();
  });
});

describe("scriptDownloadFileName", () => {
  it("keeps safe ASCII and appends the .js suffix", () => {
    expect(scriptDownloadFileName("rules.v2")).toBe("rules.v2.js");
    expect(scriptDownloadFileName("custom.js")).toBe("custom.js");
    expect(scriptDownloadFileName("Steam 直连")).toBe("Steam.js");
  });

  it("falls back when the name has no usable characters", () => {
    expect(scriptDownloadFileName("我的规则")).toBe("extension-script.js");
    expect(scriptDownloadFileName("   ")).toBe("extension-script.js");
  });

  it("caps the length", () => {
    expect(scriptDownloadFileName("a".repeat(120))).toBe(`${"a".repeat(60)}.js`);
  });
});
