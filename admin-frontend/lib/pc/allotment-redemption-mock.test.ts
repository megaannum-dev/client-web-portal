import { describe, expect, it } from "vitest";
import {
  AR_REDEMPTIONS_SEED,
  COMPLIANCE_THRESHOLD,
  arNeedsCompliance,
  arRedeemAmt,
  type Redemption,
} from "@/lib/pc/allotment-redemption-mock";

// Guards the money/threshold path that drives compliance routing.
describe("arNeedsCompliance", () => {
  const mk = (mid: string, mult: number): Redemption =>
    ({ id: "x", mid, mult, rm: "", ref: "", status: "pending_pc", date: "" });

  it("routes strictly ABOVE the US$300K threshold", () => {
    // mC per-unit notional = 500,000
    expect(arRedeemAmt(mk("mC", 1))).toBe(500_000);
    expect(arNeedsCompliance(mk("mC", 1))).toBe(true);
  });

  it("does not route at or below the threshold", () => {
    // mC × 0.5 = 250,000 (< 300k); an exact-threshold amount is also excluded (strict >)
    expect(arNeedsCompliance(mk("mC", 0.5))).toBe(false);
    expect(arNeedsCompliance({ ...mk("mC", 1), mult: COMPLIANCE_THRESHOLD / 500_000 })).toBe(false);
  });

  it("seed rd1 (mA ×1 = 1M) needs compliance; seed rd4 (mC ×0.5 = 250k) does not", () => {
    const rd1 = AR_REDEMPTIONS_SEED.find((r) => r.id === "rd1")!;
    const rd4 = AR_REDEMPTIONS_SEED.find((r) => r.id === "rd4")!;
    expect(arNeedsCompliance(rd1)).toBe(true);
    expect(arNeedsCompliance(rd4)).toBe(false);
  });
});
