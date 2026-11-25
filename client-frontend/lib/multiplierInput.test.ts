import { describe, expect, it } from "vitest";
import { multiplierIssue, nextMultiplier } from "@/lib/multiplierInput";

describe("nextMultiplier", () => {
  it("keeps a positive integer draft and drops anything else", () => {
    expect(nextMultiplier("1")).toBe("1");
    expect(nextMultiplier(" 2 ")).toBe("2");
    expect(nextMultiplier("")).toBe("");
    expect(nextMultiplier("01")).toBe("01");
    expect(nextMultiplier("-1")).toBeNull();
    expect(nextMultiplier("1.5")).toBeNull();
    expect(nextMultiplier("1e2")).toBeNull();
    expect(nextMultiplier("1.")).toBeNull();
  });
});

describe("multiplierIssue", () => {
  it("accepts a positive integer within the holding", () => {
    expect(multiplierIssue("1")).toBeNull();
    expect(multiplierIssue("2", 2)).toBeNull();
  });

  it("rejects empty, zero, decimals, and a redemption above units held", () => {
    expect(multiplierIssue("")).toBe("invalid");
    expect(multiplierIssue("0")).toBe("invalid");
    expect(multiplierIssue("1.5")).toBe("invalid");
    expect(multiplierIssue("3", 2)).toBe("exceeds");
  });
});
