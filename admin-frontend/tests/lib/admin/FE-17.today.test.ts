import { describe, expect, it } from "vitest";
import { isoDateOrNull, labelFromIso } from "@/lib/admin/today";

describe("admin today helpers", () => {
  it("isoDateOrNull keeps the local calendar day (no UTC shift)", () => {
    expect(isoDateOrNull("27 Jul 2026")).toBe("2026-07-27");
    expect(isoDateOrNull("")).toBeNull();
    expect(isoDateOrNull("nonsense")).toBeNull();
  });

  it("labelFromIso round-trips through isoDateOrNull", () => {
    expect(labelFromIso("2026-07-27")).toBe("27 Jul 2026");
    expect(isoDateOrNull(labelFromIso("2026-01-01"))).toBe("2026-01-01");
    expect(labelFromIso(null)).toBe("");
  });
});
