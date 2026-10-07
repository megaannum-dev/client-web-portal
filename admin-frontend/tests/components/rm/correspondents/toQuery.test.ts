import { describe, expect, it } from "vitest";
import { INITIAL_UI, fmtShared, toQuery } from "@/components/rm/correspondents/toQuery";

const today = new Date(2026, 9, 7, 12); // 7 Oct 2026, local

describe("toQuery", () => {
  it("omits empty values and view=all", () => {
    expect(toQuery(INITIAL_UI, today)).toEqual({ sort: "desc" });
  });
  it.each([["7", "2026-09-30"], ["30", "2026-09-07"], ["90", "2026-07-09"]] as const)(
    "preset %s -> date_from", (preset, from) => {
      expect(toQuery({ ...INITIAL_UI, preset }, today).date_from).toBe(from);
    });
  it("custom range passes from/to, dropping blanks", () => {
    expect(toQuery({ ...INITIAL_UI, preset: "custom", from: "2026-01-01", to: "" }, today))
      .toEqual({ sort: "desc", date_from: "2026-01-01" });
  });
  it("passes view, senders, trimmed q and sort", () => {
    expect(toQuery({ ...INITIAL_UI, view: "in", senders: ["a", "b"], q: " x ", sort: "asc" }, today))
      .toEqual({ sort: "asc", view: "in", sender: ["a", "b"], q: "x" });
  });
});

describe("fmtShared", () => {
  it("Today / Yesterday / MMM dd, yyyy", () => {
    expect(fmtShared(new Date(2026, 9, 7, 9).toISOString(), today)).toBe("Today");
    expect(fmtShared(new Date(2026, 9, 6, 9).toISOString(), today)).toBe("Yesterday");
    expect(fmtShared(new Date(2026, 2, 5, 9).toISOString(), today)).toBe("Mar 05, 2026");
  });
});
