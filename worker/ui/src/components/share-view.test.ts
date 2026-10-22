import { describe, expect, it } from "vitest";
import { readShareCodeFromHash } from "./share-view";

describe("readShareCodeFromHash", () => {
  it("extracts the share code from the hash route", () => {
    expect(readShareCodeFromHash("#/share/abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(readShareCodeFromHash("#share/abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(readShareCodeFromHash("/share/abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(readShareCodeFromHash("  #/share/abcdefghijklmnop  ")).toBe("abcdefghijklmnop");
    expect(readShareCodeFromHash("#/share/a%20b")).toBe("a b");
  });

  it("returns null for other routes and malformed encodings", () => {
    expect(readShareCodeFromHash("")).toBeNull();
    expect(readShareCodeFromHash("#/sources")).toBeNull();
    expect(readShareCodeFromHash("#/share/")).toBeNull();
    expect(readShareCodeFromHash("#/share/%E0%A4%A")).toBeNull();
  });
});
