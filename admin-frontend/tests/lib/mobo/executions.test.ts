import { describe, expect, it } from "vitest";
import { mapExecutions } from "@/lib/mobo/executions";
import type { UnifiedExecutionRowDTO, UnifiedExecutionsViewDTO } from "@/lib/mobo/executions";

// Factory: sensible non-null defaults, override per-case so each test stays
// one or two lines. Defaults intentionally use distinct values per field so a
// mis-wired mapper field (e.g. reading the wrong DTO key) shows up as a
// mismatch rather than an accidental pass.
function row(overrides: Partial<UnifiedExecutionRowDTO> = {}): UnifiedExecutionRowDTO {
  return {
    system: "CRM",
    account: "ACC-1",
    txn_type: "order",
    descrpt: "AAPL 15AUG26 200 C",
    exchange: "NASDAQ",
    currency: "USD",
    asset_class: "OPT-CALL",
    trade_date: "2026-08-11",
    direction: "BUY",
    price: "1.5",
    qty: "10",
    trade_amt: "150",
    fee: "0.53",
    settlement_amt: "-150.53",
    status: "Filled",
    txn_time_utc: "2026-08-11T14:24:00Z",
    group_ref: "grp-1",
    ...overrides,
  };
}

function view(rows: UnifiedExecutionRowDTO[]): UnifiedExecutionsViewDTO {
  return { day: null, days: [], rows, warnings: [] };
}

describe("mapExecutions — isFirst grouping and order", () => {
  it("is true only on the first row of each contiguous group_ref run, false otherwise", () => {
    // A, A, B, A — last A is a NEW run (compares only to the immediately
    // previous row, per the backend's pre-sorted-executions-under-parent-order guarantee)
    const rows = [
      row({ group_ref: "A" }),
      row({ group_ref: "A" }),
      row({ group_ref: "B" }),
      row({ group_ref: "A" }),
    ];
    const out = mapExecutions(view(rows));
    expect(out.map((r) => r.isFirst)).toEqual([true, false, true, true]);
  });

  it("preserves input order without sorting or filtering", () => {
    const rows = [
      row({ group_ref: "Z" }),
      row({ group_ref: "A" }),
      row({ group_ref: "M" }),
    ];
    const out = mapExecutions(view(rows));
    expect(out.map((r) => r.groupRef)).toEqual(["Z", "A", "M"]);
  });
});

describe("mapExecutions — nulls", () => {
  it("renders every nullable field as \"—\" and never NaN/Invalid Date/$NaN/empty string", () => {
    const nullRow = row({
      account: null,
      descrpt: null,
      exchange: null,
      currency: null,
      asset_class: null,
      trade_date: null,
      direction: null,
      price: null,
      qty: null,
      trade_amt: null,
      fee: null,
      settlement_amt: null,
      status: null,
      txn_time_utc: null,
    });
    const [out] = mapExecutions(view([nullRow]));

    const nullableFields: (keyof typeof out)[] = [
      "account",
      "descrpt",
      "exchange",
      "currency",
      "assetClass",
      "tradeDate",
      "direction",
      "price",
      "qty",
      "tradeAmt",
      "fee",
      "settlementAmt",
      "status",
      "txnTime",
    ];
    for (const field of nullableFields) {
      expect(out[field]).toBe("—");
    }

    const rendered = Object.values(out).join(" ");
    expect(rendered).not.toContain("NaN");
    expect(rendered).not.toContain("Invalid Date");
    expect(rendered).not.toContain("$NaN");
    for (const field of nullableFields) {
      expect(out[field]).not.toBe("");
    }
  });
});

describe("mapExecutions — signed fields", () => {
  it("renders a negative fee (rebate) with a visible minus sign", () => {
    const [out] = mapExecutions(view([row({ fee: "-0.5306" })]));
    expect(out.fee).toBe("-$0.53");
  });

  it("renders a positive fee with no minus sign", () => {
    const [out] = mapExecutions(view([row({ fee: "0.5306" })]));
    expect(out.fee).toBe("$0.53");
  });
});

describe("mapExecutions — ET time rendering (timezone-independent)", () => {
  it("renders txn_time_utc in America/New_York regardless of the runner's local timezone", () => {
    // Documented example: an instant just after UTC midnight is still the
    // previous evening in ET, and trade_date correctly stays on that prior day.
    const [out] = mapExecutions(
      view([row({ txn_time_utc: "2026-08-12T01:24:00Z", trade_date: "2026-08-11" })]),
    );

    // Compute the expected ET wall-clock time independently of any hardcoded
    // offset assumption, so this test is correct whether or not DST-style
    // rules changed the ET offset for this date.
    const expected = new Date("2026-08-12T01:24:00Z").toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/New_York",
    });

    expect(out.txnTime).toBe(expected);
    expect(out.txnTime).toContain("9:24:00 PM"); // evening ET, not the UTC hour
    expect(out.tradeDate).toBe("Aug 11, 2026");
  });
});

describe("mapExecutions — calendar dates formatted in UTC", () => {
  it("renders trade_date as the same calendar day regardless of local timezone", () => {
    const [out] = mapExecutions(view([row({ trade_date: "2026-08-11" })]));
    expect(out.tradeDate).toBe("Aug 11, 2026");
  });
});

describe("mapExecutions — trivia", () => {
  it("returns [] for null input", () => {
    expect(mapExecutions(null)).toEqual([]);
  });

  it("returns [] for an empty rows array", () => {
    expect(mapExecutions(view([]))).toEqual([]);
  });

  it("maps txn_type 'order' -> 'Order' and 'execution' -> 'Execution'", () => {
    const out = mapExecutions(view([row({ txn_type: "order" }), row({ txn_type: "execution" })]));
    expect(out[0].txnType).toBe("Order");
    expect(out[1].txnType).toBe("Execution");
  });

  it("statusReal is true only for system 'PC'", () => {
    const out = mapExecutions(
      view([row({ system: "CRM" }), row({ system: "IB" }), row({ system: "PC" })]),
    );
    expect(out.map((r) => r.statusReal)).toEqual([false, false, true]);
  });

  it("carries groupRef through even though it is never rendered in a visible column", () => {
    const [out] = mapExecutions(view([row({ group_ref: "grp-xyz" })]));
    expect(out.groupRef).toBe("grp-xyz");
  });
});
