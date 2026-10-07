import { describe, expect, it } from "vitest";
import { INITIAL_UI, fmtShared, toQuery } from "@/components/rm/correspondents/toQuery";

const today = new Date(2026, 9, 7, 12); // 7 Oct 2026, local

describe("toQuery", () => {
  it("omits empty values and view=all", () => {
    expect(toQuery(INITIAL_UI)).toEqual({ sort: "desc" });
  });
  it("passes from/to, dropping blanks", () => {
    expect(toQuery({ ...INITIAL_UI, from: "2026-01-01", to: "" })).toEqual({ sort: "desc", date_from: "2026-01-01" });
    expect(toQuery({ ...INITIAL_UI, from: "2026-01-01", to: "2026-01-31" }))
      .toEqual({ sort: "desc", date_from: "2026-01-01", date_to: "2026-01-31" });
  });
  it("passes view, senders, trimmed q and sort", () => {
    expect(toQuery({ ...INITIAL_UI, view: "in", senders: ["a", "b"], q: " x ", sort: "asc" }))
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
