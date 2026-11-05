import { describe, it, expect } from "vitest";
import { parseFeePercent, formatFeePercent } from "./fee";

describe("fee round trip (Duplicate model seeds percent inputs from fractions)", () => {
  it.each([0.02, 0.2, 0.015])("%s survives format -> parse", (x) => {
    expect(parseFeePercent(formatFeePercent(x).replace("%", ""))).toBeCloseTo(x, 10);
  });
});
