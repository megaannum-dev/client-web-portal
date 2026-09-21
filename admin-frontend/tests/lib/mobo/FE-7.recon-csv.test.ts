import { describe, expect, it } from "vitest";
import { toReconCsv, reconCsvFilename } from "@/lib/mobo/reconCsv";
import { mapExecutions, walkNodes, RECON_COLUMNS } from "@/lib/mobo/executions";
import type {
  ExecutionNodeDTO,
  OrderNodeDTO,
  TradeNodeDTO,
  TradeTotalsDTO,
  UnifiedExecutionsViewDTO,
} from "@/lib/mobo/executions";

const BOM = "﻿";

// Same factory style as tests/lib/mobo/executions.test.ts.
function execRow(overrides: Partial<ExecutionNodeDTO> = {}): ExecutionNodeDTO {
  return {
    system: "PC",
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

function cols(keys: string[]) {
  return RECON_COLUMNS.filter((c) => keys.includes(c.key));
}

describe("toReconCsv — header", () => {
  it("is Level, then the heads of the passed columns only, then State, Breaks", () => {
    const nodes = walkNodes(mapExecutions(viewOf([tradeRow()])));
    const csv = toReconCsv(nodes, cols(["system", "descrpt", "price"]));
    const header = csv.slice(BOM.length).split("\r\n")[0];
    expect(header).toBe("Level,System,Descrpt,Price,State,Breaks");
    expect(header).not.toContain("Account Number"); // hidden column really absent
  });
});

describe("toReconCsv — rows", () => {
  it("emits one line per node in the order given, Level carrying the grain", () => {
    const nodes = walkNodes(mapExecutions(viewOf([tradeRow()])));
    const csv = toReconCsv(nodes, cols(["descrpt"]));
    const lines = csv.slice(BOM.length).split("\r\n").filter(Boolean);
    // header + trade + order + execution
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith("Trade,")).toBe(true);
    expect(lines[2].startsWith("Order,")).toBe(true);
    expect(lines[3].startsWith("Execution,")).toBe(true);
  });

  it("State reads Missing / Break / Matched and Breaks joins wire field names with ';'", () => {
    const t = tradeRow({
      orders: [orderRow({}, [
        execRow({ ref: "exec-break", breaks: ["price", "qty"] }),
        execRow({
          ref: "exec-missing", missing: true,
          price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null,
        }),
      ])],
    });
    const nodes = walkNodes(mapExecutions(viewOf([t])));
    const byRef = Object.fromEntries(nodes.map((n) => [n.ref, n]));
    const csv = toReconCsv([byRef["exec-break"], byRef["exec-missing"]], cols(["descrpt"]));
    const lines = csv.slice(BOM.length).split("\r\n").filter(Boolean);
    const [, breakLine, missingLine] = lines;
    expect(breakLine.endsWith(",Break,price;qty")).toBe(true);
    expect(missingLine.endsWith(",Missing,")).toBe(true);
  });

  it("a missing node emits the em dash in transaction columns", () => {
    const missing = execRow({
      missing: true, price: null, qty: null, trade_amt: null, fee: null, settlement_amt: null,
    });
    const t = tradeRow({ orders: [orderRow({}, [missing])] });
    const nodes = walkNodes(mapExecutions(viewOf([t])));
    const execNode = nodes.find((n) => n.kind === "Execution")!;
    const csv = toReconCsv([execNode], cols(["price", "qty"]));
    const line = csv.slice(BOM.length).split("\r\n")[1];
    expect(line).toBe("Execution,—,—,Missing,");
  });
});

describe("toReconCsv — quoting", () => {
  it("quotes a value containing a comma or a double quote, doubling inner quotes", () => {
    const t = tradeRow({ descrpt: 'SPY 20AUG26, "Weekly" 766 C' });
    const nodes = walkNodes(mapExecutions(viewOf([t])));
    const trade = nodes[0];
    const csv = toReconCsv([trade], cols(["descrpt"]));
    const line = csv.slice(BOM.length).split("\r\n")[1];
    expect(line).toBe('Trade,"SPY 20AUG26, ""Weekly"" 766 C",Matched,');
  });
});

describe("toReconCsv — encoding", () => {
  it("starts with the UTF-8 BOM and uses CRLF line endings", () => {
    const nodes = walkNodes(mapExecutions(viewOf([tradeRow()])));
    const csv = toReconCsv(nodes, cols(["descrpt"]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.includes("\r\n")).toBe(true);
    expect(csv.includes("\n") && !csv.includes("\r\n")).toBe(false);
  });
});

describe("reconCsvFilename", () => {
  it("names the file after the day", () => {
    expect(reconCsvFilename({ day: "2026-08-25", filtered: false })).toBe("recon-2026-08-25.csv");
  });

  it("falls back to 'latest' for a null day", () => {
    expect(reconCsvFilename({ day: null, filtered: false })).toBe("recon-latest.csv");
  });

  it("appends -filtered when the export reflects active filters", () => {
    expect(reconCsvFilename({ day: "2026-08-25", filtered: true })).toBe("recon-2026-08-25-filtered.csv");
  });
});
