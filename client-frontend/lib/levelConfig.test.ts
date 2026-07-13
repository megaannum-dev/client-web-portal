import { describe, expect, it } from "vitest";
import { LEVEL_CONFIG } from "@/lib/levelConfig";

describe("LEVEL_CONFIG", () => {
  it("has an entry for every ActionLevel", () => {
    expect(Object.keys(LEVEL_CONFIG).sort()).toEqual(
      ["caution", "info", "neutral", "primary", "urgent"].sort(),
    );
  });

  it("every entry has a non-empty card/icon/title/Icon", () => {
    for (const entry of Object.values(LEVEL_CONFIG)) {
      expect(entry.card).toBeTruthy();
      expect(entry.icon).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.Icon).toBeTruthy();
    }
  });
});
