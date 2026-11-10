import { describe, expect, it } from "vitest";
import { todayIso } from "@/lib/admin/today";

describe("admin today helpers", () => {
  it("todayIso keeps the local calendar day (no UTC shift)", () => {
    // Local midnight: toISOString() would give 2026-07-26 east of UTC.
    expect(todayIso(new Date(2026, 6, 27))).toBe("2026-07-27");
    expect(todayIso(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
});
