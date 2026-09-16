import { describe, expect, it } from "vitest";
import { mapExecutions, walkNodes } from "@/lib/mobo/executions";
import type {
  ExecutionNodeDTO,
  OrderNodeDTO,
  TradeNodeDTO,
  TradeTotalsDTO,
  UnifiedExecutionsViewDTO,
} from "@/lib/mobo/executions";

// Factories: sensible non-null defaults, shallow overrides, so each test
// stays a couple of lines. Distinct default values per field so a mis-wired
// mapper field shows up as a mismatch rather than an accidental pass.
function execRow(overrides: Partial<ExecutionNodeDTO> = {}): ExecutionNodeDTO {
  return {
    system: "CRM",
    account: "ACC-1",
    txn_type: "execution",
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
    group_ref: "ord-1",
    ref: "exec-1",
    trade_ref: "trade-1",
    missing: false,
    breaks: [],
    missing_from: [],
    ...overrides,
  };
}

function orderRow(
  overrides: Partial<Omit<OrderNodeDTO, "executions">> = {},
  executions: ExecutionNodeDTO[] = [],
): OrderNodeDTO {
  return { ...execRow({ txn_type: "order", ref: "ord-1", ...overrides }), executions };
}

function totals(overrides: Partial<TradeTotalsDTO> = {}): TradeTotalsDTO {
  return { qty: "10", price: "1.5", trade_amt: "150", fee: "0.53", settlement_amt: "-150.53", ...overrides };
}

function tradeRow(overrides: Partial<TradeNodeDTO> = {}): TradeNodeDTO {
  return {
    ref: "trade-1",
    account: "ACC-1",
    descrpt: "AAPL 15AUG26 200 C",
    trade_date: "2026-08-11",
    direction: "BUY",
    asset_class: "OPT-CALL",
    by_system: { CRM: totals(), IB: totals(), PC: totals() },
    breaks: [],
    missing_from: [],
    orders: [orderRow({}, [execRow()])],
    ...overrides,
  };
}

function viewOf(trades: TradeNodeDTO[]): UnifiedExecutionsViewDTO {
  return {
    day: "2026-08-11",
    days: [],
    trades,
    warnings: [],
    recon: { broken_rows: [], missing_rows: [], by_field: {}, missing_by_system: {} },
  };
}

describe("mapExecutions — tree shape", () => {
  it("builds one ReconNode per trade at level 0, orders at level 1, fills at level 2, with kind set per grain", () => {
    const t = tradeRow({ orders: [orderRow({}, [execRow()])] });
    const [trade] = mapExecutions(viewOf([t]));
    expect(trade.level).toBe(0);
    expect(trade.kind).toBe("Trade");

    const [order] = trade.children;
    expect(order.level).toBe(1);
    expect(order.kind).toBe("Order");

    const [exec] = order.children;
    expect(exec.level).toBe(2);
    expect(exec.kind).toBe("Execution");
  });

  it("maps txn_type 'order' -> 'Order' and 'execution' -> 'Execution'", () => {
    const t = tradeRow({
      orders: [orderRow({ txn_type: "order" }, [execRow({ txn_type: "execution" })])],
    });
    const [order] = mapExecutions(viewOf([t]))[0].children;
    expect(order.kind).toBe("Order");
    expect(order.children[0].kind).toBe("Execution");
  });
});

describe("mapExecutions — systems ordering", () => {
  it("lists only the systems present in by_system, in CRM -> IB -> PC order regardless of insertion order", () => {
    const t = tradeRow({ by_system: { PC: totals(), CRM: totals() } }); // IB absent, PC inserted first
    const [out] = mapExecutions(viewOf([t]));
    expect(out.systems).toEqual(["CRM", "PC"]);
  });
});

describe("mapExecutions — trade-level agreement", () => {
  it("shows the value and leaves brk empty when every system's total matches", () => {
    const t = tradeRow({
      by_system: { CRM: totals({ qty: "10" }), IB: totals({ qty: "10" }), PC: totals({ qty: "10" }) },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.qty).toBe("10");
    expect(out.brk.qty).toBeUndefined();
  });

  it("flags brk[field] and names each system's own figure in cellTitle when totals disagree", () => {
    const t = tradeRow({
      by_system: { CRM: totals({ qty: "10" }), IB: totals({ qty: "12" }), PC: totals({ qty: "10" }) },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.brk.qty).toBe(true);
    expect(out.cellTitle.qty).toContain("CRM");
    expect(out.cellTitle.qty).toContain("IB");
    expect(out.cellTitle.qty).toContain("PC");
  });

  it("keeps two prices within 1e-7 as agreeing (rounded weighted average on every source)", () => {
    const t = tradeRow({
      by_system: { CRM: totals({ price: "1.500000001" }), IB: totals({ price: "1.5" }) },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.brk.price).toBeUndefined();
  });

  it("a structural trade-level disagreement reaches hasBreak and the status chip", () => {
    // Otherwise the row shows a red QTY cell beside a green "Matched" chip and
    // goes uncounted in the exception bento.
    const t = tradeRow({
      by_system: { CRM: totals({ qty: "10" }), IB: totals({ qty: "12" }) },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.brk.qty).toBe(true);
    expect(out.hasBreak).toBe(true);
    expect(out.status).toBe("Break");
  });

  it("a money-only disagreement marks the cell but is not an exception", () => {
    // Price / trade amt / fee / settlement are each source's own figure -- PC's
    // settlement is MODELLED, not observed -- so they are shown, not escalated.
    const t = tradeRow({
      by_system: {
        CRM: totals({ settlement_amt: "-150.53" }),
        IB: totals({ settlement_amt: "-151.10" }),
      },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.brk.settlementAmt).toBe(true);
    expect(out.cellTitle.settlementAmt).toContain("IB");
    expect(out.hasBreak).toBe(false);
    expect(out.status).toBe("Matched");
  });

  it("does not flag totals that differ below the cent they are rendered at", () => {
    // PC carries 9dp (modeled_cash_flow_after_fees_usd); CRM and IB carry two.
    // A raw !== painted matching trades red -- the tooltip read
    // "CRM $166.61 - IB $166.61 - PC $166.61" on a cell marked broken.
    const t = tradeRow({
      by_system: {
        CRM: totals({ settlement_amt: "166.61" }),
        IB: totals({ settlement_amt: "166.6100" }),
        PC: totals({ settlement_amt: "166.6094321" }),
      },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.settlementAmt).toBe("$166.61");
    expect(out.brk.settlementAmt).toBeUndefined();
    expect(out.cellTitle.settlementAmt).toBeUndefined();
  });

  it("flags a visible price difference as a disagreement", () => {
    const t = tradeRow({
      by_system: { CRM: totals({ price: "1.50" }), IB: totals({ price: "1.53" }) },
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.brk.price).toBe(true);
  });
});

describe("mapExecutions — roll-up", () => {
  it("hasBreak is true on a trade whose only break sits on a nested execution", () => {
    const t = tradeRow({ orders: [orderRow({}, [execRow({ breaks: ["price"] })])] });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.hasBreak).toBe(true);
    expect(out.breaks).toEqual([]); // the trade's OWN wire breaks stay empty — this is a roll-up
  });

  it("hasMissing is true on a trade whose only problem is a missing placeholder two levels down", () => {
    const t = tradeRow({
      orders: [orderRow({}, [
        execRow({ missing: true, price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null }),
      ])],
    });
    const [out] = mapExecutions(viewOf([t]));
    expect(out.hasMissing).toBe(true);
  });
});

describe("mapExecutions — missing placeholder", () => {
  it("keeps null economics through the formatters as em dash, never $0.00", () => {
    const t = tradeRow({
      orders: [orderRow({}, [
        execRow({ missing: true, price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null }),
      ])],
    });
    const [, , exec] = walkNodes(mapExecutions(viewOf([t])));
    expect(exec.price).toBe("—");
    expect(exec.qty).toBe("—");
    expect(exec.tradeAmt).toBe("—");
    expect(exec.fee).toBe("—");
    expect(exec.settlementAmt).toBe("—");
  });
});

describe("mapExecutions — signed fields", () => {
  it("keeps a negative fee (rebate) signed, never abs()'d", () => {
    const t = tradeRow({ orders: [orderRow({}, [execRow({ fee: "-0.5306" })])] });
    const [, , exec] = walkNodes(mapExecutions(viewOf([t])));
    expect(exec.fee).toBe("-$0.53");
  });

  it("renders a positive fee with no minus sign", () => {
    const t = tradeRow({ orders: [orderRow({}, [execRow({ fee: "0.5306" })])] });
    const [, , exec] = walkNodes(mapExecutions(viewOf([t])));
    expect(exec.fee).toBe("$0.53");
  });
});

describe("mapExecutions — statusReal", () => {
  it("is true only for real (non-missing) PC rows", () => {
    const t = tradeRow({
      orders: [
        orderRow({ ref: "ord-crm", system: "CRM" }, [execRow({ ref: "exec-crm", system: "CRM" })]),
        orderRow({ ref: "ord-pc", system: "PC" }, [execRow({ ref: "exec-pc", system: "PC" })]),
        orderRow({
          ref: "ord-pc-missing", system: "PC", missing: true,
          price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null,
        }, []),
      ],
    });
    const nodes = walkNodes(mapExecutions(viewOf([t])));
    const byRef = Object.fromEntries(nodes.map((n) => [n.ref, n]));
    expect(byRef["ord-crm"].statusReal).toBe(false);
    expect(byRef["exec-crm"].statusReal).toBe(false);
    expect(byRef["ord-pc"].statusReal).toBe(true);
    expect(byRef["exec-pc"].statusReal).toBe(true);
    expect(byRef["ord-pc-missing"].statusReal).toBe(false);
    expect(nodes.find((n) => n.kind === "Trade")!.statusReal).toBe(false);
  });
});

describe("walkNodes", () => {
  it("returns depth-first render order", () => {
    const t = tradeRow({
      ref: "T",
      orders: [
        orderRow({ ref: "O1" }, [execRow({ ref: "E1" })]),
        orderRow({ ref: "O2" }, [execRow({ ref: "E2" })]),
      ],
    });
    const nodes = walkNodes(mapExecutions(viewOf([t])));
    expect(nodes.map((n) => n.ref)).toEqual(["T", "O1", "E1", "O2", "E2"]);
  });
});

describe("mapExecutions — trivia", () => {
  it("returns [] for null input", () => {
    expect(mapExecutions(null)).toEqual([]);
  });
});
