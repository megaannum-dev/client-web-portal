// Meeting times render in HK time whatever the browser's timezone (run under TZ=UTC).
import { describe, it, expect } from "vitest";
import { fmtDate, fmtTime, hkDayKey } from "@/components/compliance/ic-notes/format";

describe("IC notes HK time", () => {
  it("06:31Z shows as 14:31 HKT", () => {
    expect(fmtTime("2026-09-24T06:31:00Z")).toBe("14:31");
  });
  it("day rolls over at HK midnight, not UTC", () => {
    expect(hkDayKey("2026-09-23T17:00:00Z")).toBe("2026-09-24");
    expect(fmtDate("2026-09-23T17:00:00Z")).toMatch(/^24 Sep/);
  });
});
