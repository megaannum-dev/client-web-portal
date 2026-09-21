import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReconGrid } from "@/components/mobo/recon/ReconGrid";
import { mapExecutions } from "@/lib/mobo/executions";
import type {
  ExecutionNodeDTO,
  OrderNodeDTO,
  TradeNodeDTO,
  TradeTotalsDTO,
  UnifiedExecutionsViewDTO,
} from "@/lib/mobo/executions";

// jsdom has no URL.createObjectURL — downloadReconCsv would throw. We never
// click an export control in this file, but the grid builds the closure
// eagerly in an effect, so keep it inert either way.
vi.mock("@/lib/mobo/reconCsv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mobo/reconCsv")>()),
  downloadReconCsv: vi.fn(),
}));

// Same factory style as tests/lib/mobo/executions.test.ts.
function execRow(overrides: Partial<ExecutionNodeDTO> = {}): ExecutionNodeDTO {
  return {
    system: "CRM",
    account: "ACC-1",
    txn_type: "execution",
    symbol: "AAPL260815C00200000",
    descrpt: "AAPL 15AUG26 200 C",
    exchange: "NASDAQ",
    currency: "USD",
    asset_cat: "OPT",
    sub_cat: "CALL",
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
    symbol: "AAPL260815C00200000",
    descrpt: "AAPL 15AUG26 200 C",
    trade_date: "2026-08-11",
    direction: "BUY",
    asset_cat: "OPT",
    sub_cat: "CALL",
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

/** Trade A: plain matched trade, one CRM order + fill.
 *  Trade B: matched at the trade level, but its lone execution disagrees on
 *  price — the roll-up case: the break lives two levels down.
 *  Trade C: matched at the trade level, but its lone execution is a
 *  synthesized `missing` placeholder — same roll-up shape for hasMissing. */
function buildTrades() {
  const A = tradeRow({
    ref: "A", account: "ACC-A", descrpt: "AAPL 15AUG26 200 C",
    orders: [orderRow({ ref: "ord-A1", system: "CRM", account: "ACC-A", descrpt: "AAPL 15AUG26 200 C" }, [
      execRow({ ref: "exec-A1", system: "CRM", account: "ACC-A", descrpt: "AAPL 15AUG26 200 C" }),
    ])],
  });
  const B = tradeRow({
    ref: "B", account: "ACC-B", descrpt: "MSFT 15AUG26 300 C",
    orders: [orderRow({ ref: "ord-B1", system: "IB", account: "ACC-B", descrpt: "MSFT 15AUG26 300 C" }, [
      execRow({ ref: "exec-B1", system: "IB", account: "ACC-B", descrpt: "MSFT 15AUG26 300 C", breaks: ["price"] }),
    ])],
  });
  const C = tradeRow({
    ref: "C", account: "ACC-C", descrpt: "TSLA 15AUG26 400 C",
    orders: [orderRow({ ref: "ord-C1", system: "PC", account: "ACC-C", descrpt: "TSLA 15AUG26 400 C" }, [
      execRow({
        ref: "exec-C1", system: "PC", account: "ACC-C", descrpt: "TSLA 15AUG26 400 C", missing: true,
        price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null,
        status: null, txn_time_utc: null, direction: null,
      }),
    ])],
  });
  return mapExecutions(viewOf([A, B, C]));
}

describe("ReconGrid — expansion depth", () => {
  it("at depth Trade only the trade rows render; Execution reveals orders and fills too", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 trades

    fireEvent.click(screen.getByRole("button", { name: "Execution" }));
    expect(screen.getAllByRole("row")).toHaveLength(10); // header + 3 trades + 3 orders + 3 fills
  });
});

describe("ReconGrid — sorting keeps the hierarchy", () => {
  /** A trade whose two orders arrive qty 5 then qty 1, so an ascending qty sort
   *  must reorder them WITHIN the trade rather than hoisting either out of it. */
  function nested() {
    const t = tradeRow({
      ref: "T", account: "ACC-T", descrpt: "NVDA 15AUG26 500 C",
      orders: [
        orderRow({ ref: "ord-hi", system: "CRM", account: "ACC-T", descrpt: "NVDA 15AUG26 500 C", qty: "5" }),
        orderRow({ ref: "ord-lo", system: "IB", account: "ACC-T", descrpt: "NVDA 15AUG26 500 C", qty: "1" }),
      ],
    });
    return mapExecutions(viewOf([t]));
  }

  const kinds = () =>
    screen.getAllByRole("row").slice(1).map((r) => r.children[2].textContent);

  it("sorts siblings without flattening the tree", () => {
    render(<ReconGrid trades={nested()} day="2026-08-11" error={null} />);
    // depth defaults to Order, so the trade and both of its orders are visible
    expect(kinds()).toEqual(["Trade", "Order", "Order"]);
    expect(screen.getAllByRole("row")[2].children[10].textContent).toBe("5");

    fireEvent.click(screen.getByText("QTY"));

    // still Trade-then-its-orders, only the two orders swapped places
    expect(kinds()).toEqual(["Trade", "Order", "Order"]);
    expect(screen.getAllByRole("row")[2].children[10].textContent).toBe("1");
    expect(screen.getAllByRole("row")[3].children[10].textContent).toBe("5");
  });

  it("keeps a sort applied across an expansion-level change", () => {
    render(<ReconGrid trades={nested()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByText("QTY"));
    fireEvent.click(screen.getByRole("button", { name: "Execution" }));
    expect(screen.getAllByRole("row")[2].children[10].textContent).toBe("1");
  });
});

describe("ReconGrid — row click toggles children", () => {
  it("clicking a trade row opens and closes its own children", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(screen.getAllByRole("row")).toHaveLength(4);

    const tradeARow = screen.getByText("AAPL 15AUG26 200 C").closest("tr")!;
    fireEvent.click(tradeARow);
    expect(screen.getAllByRole("row")).toHaveLength(5); // + trade A's one order

    fireEvent.click(tradeARow);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
});

describe("ReconGrid — break roll-up styling", () => {
  it("a trade whose only break is on a nested fill still shows break styling while collapsed", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));

    const tradeBRow = screen.getByText("MSFT 15AUG26 300 C").closest("tr")!;
    expect(tradeBRow.getAttribute("style") ?? "").toMatch(/rgba\(242,\s*116,\s*5/);
  });
});

describe("ReconGrid — System filter keeps ancestor trade rows", () => {
  it("selecting a System value keeps the matching trade's ancestor row, not just its descendant", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByRole("button", { name: /^System/ }));
    fireEvent.click(screen.getByRole("button", { name: "IB" }));

    // Trade B (whose order/fill are IB) survives via the subtree-keeping rule —
    // its trade row AND its (still-visible, default-depth) order row both show.
    expect(screen.queryAllByText("MSFT 15AUG26 300 C").length).toBeGreaterThan(0);
    // ...while trade A, which has no IB records anywhere in its subtree, is pruned entirely.
    expect(screen.queryAllByText("AAPL 15AUG26 200 C")).toHaveLength(0);
  });
});

describe("ReconGrid — search and reset", () => {
  it("typing in the search box narrows the rows, and Reset restores them", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(screen.getAllByRole("row")).toHaveLength(4);

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "TSLA" } });
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + trade C only

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
});

describe("ReconGrid — column visibility", () => {
  it("hiding a column via the Columns menu removes its header", () => {
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} />);
    expect(screen.getByRole("columnheader", { name: /account number/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByRole("button", { name: "Account Number" }));

    expect(screen.queryByRole("columnheader", { name: /account number/i })).not.toBeInTheDocument();
  });
});

describe("ReconGrid — empty states", () => {
  it("shows a no-trades message when there are no trades at all, and clears onExportChange", () => {
    const onExportChange = vi.fn();
    render(<ReconGrid trades={[]} day={null} error={null} onExportChange={onExportChange} />);
    expect(screen.getByText(/no trade records/i)).toBeInTheDocument();
    expect(onExportChange).toHaveBeenLastCalledWith(null);
  });

  it("shows a no-matches message when trades exist but the filter clears the table", () => {
    const onExportChange = vi.fn();
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} onExportChange={onExportChange} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "no-such-symbol-zzz" } });
    expect(screen.getByText(/no records match/i)).toBeInTheDocument();
    expect(onExportChange).toHaveBeenLastCalledWith(null);
  });
});

describe("ReconGrid — onExportChange", () => {
  it("is called with a function when rows are present", () => {
    const onExportChange = vi.fn();
    render(<ReconGrid trades={buildTrades()} day="2026-08-11" error={null} onExportChange={onExportChange} />);
    expect(onExportChange).toHaveBeenCalledWith(expect.any(Function));
  });
});
