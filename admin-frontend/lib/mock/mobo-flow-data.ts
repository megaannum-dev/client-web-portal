/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW mock data (PURGEABLE)

   Isolated here per the MOBO mock convention: reached ONLY through
   `lib/mobo/reconciliation-flow.ts`. No component imports this file
   directly. Ported from mobo/mobo-app/MoboRecon.jsx lines 39-146.
   ============================================================ */

import {
  fmtUsd,
  type RcAlloc,
  type RcAllocModelLine,
  type RcModelId,
  type RcModelMeta,
  type RcOrder,
  type RcPort,
  type RcScenarioKey,
} from "@/lib/mobo/flow-types";

export const SETTLE_DAY = "03 Jun 2026";

export const FM: Record<RcModelId, RcModelMeta> = {
  mA: { name: "Model A", color: "#f27405" },
  mB: { name: "Model B", color: "#2f7a47" },
  mC: { name: "Model C", color: "#5f5e5e" },
};

/* ---- allocation matrix (mirrors PC workspace) --------------- */
const ALLOC_UNITS: Record<string, number> = {
  "cA-mA": 1, "cA-mB": 2,
  "cB-mA": 5, "cB-mB": 2, "cB-mC": 4,
  "cC-mB": 20, "cC-mC": 1,
  "cD-mA": 1, "cD-mC": 3,
  "cE-mA": 1, "cE-mB": 1, "cE-mC": 1,
};
const RC_MODELS: RcModelId[] = ["mA", "mB", "mC"];

function rcModelUnits(mid: RcModelId): number {
  return Object.entries(ALLOC_UNITS)
    .filter(([k]) => k.endsWith(`-${mid}`))
    .reduce((s, [, u]) => s + u, 0);
}
function rcClientShare(cid: string, mid: RcModelId): number {
  const t = rcModelUnits(mid);
  return t ? (ALLOC_UNITS[`${cid}-${mid}`] || 0) / t : 0;
}

const CLIENT_META = [
  { cid: "cA", client: "Ardent Capital", preAum: 12_500_000 },
  { cid: "cB", client: "Strathmore Fund", preAum: 22_100_000 },
  { cid: "cC", client: "Vela Holdings", preAum: 8_300_000 },
  { cid: "cD", client: "Northbridge LP", preAum: 15_800_000 },
  { cid: "cE", client: "Selwyn Asset Mgmt", preAum: 9_400_000 },
];

/* ---- base order data (AlgoTrade view) ----------------------- */
const ORDERS_CLEAN: RcOrder[] = [
  { id: "o1", m: "mA", inst: "AAPL US", cat: "Equity", side: "Buy", qty: "12,000", px: "$187.40", not: "$2.25M", notVal: 2_250_000, ref: "TRD-88142", ib: "IB-40118", st: "ok",
    execs: [{ id: "x1", qty: "5,000", px: "$187.36", t: "09:31:02", st: "ok" }, { id: "x2", qty: "4,000", px: "$187.41", t: "09:33:48", st: "ok" }, { id: "x3", qty: "3,000", px: "$187.44", t: "09:36:15", st: "ok" }] },
  { id: "o2", m: "mA", inst: "MSFT US", cat: "Equity", side: "Sell", qty: "8,000", px: "$410.20", not: "$3.28M", notVal: 3_280_000, ref: "TRD-88150", ib: "IB-40126", st: "ok",
    execs: [{ id: "x1", qty: "3,000", px: "$410.20", t: "10:02:11", st: "ok" }, { id: "x2", qty: "3,500", px: "$410.20", t: "10:05:39", st: "ok" }, { id: "x3", qty: "1,500", px: "$410.20", t: "10:09:02", st: "ok" }] },
  { id: "o3", m: "mA", inst: "EUR/USD", cat: "FX", side: "Buy", qty: "€2.0M", px: "1.0842", not: "$2.17M", notVal: 2_170_000, ref: "FX-2098", ib: "IB-40205", st: "ok",
    execs: [{ id: "x1", qty: "€2.0M", px: "1.0842", t: "08:15:30", st: "ok" }] },
  { id: "o4", m: "mB", inst: "NVDA US", cat: "Equity", side: "Buy", qty: "1,200", px: "$121.85", not: "$146.2k", notVal: 146_200, ref: "TRD-88163", ib: "IB-40139", st: "ok",
    execs: [{ id: "x1", qty: "700", px: "$121.85", t: "11:14:20", st: "ok" }, { id: "x2", qty: "500", px: "$121.85", t: "11:16:58", st: "ok" }] },
  { id: "o5", m: "mB", inst: "TSLA US", cat: "Equity", side: "Buy", qty: "3,400", px: "$178.90", not: "$608.3k", notVal: 608_300, ref: "TRD-88170", ib: "IB-40145", st: "ok",
    execs: [{ id: "x1", qty: "3,400", px: "$178.90", t: "11:42:18", st: "ok" }] },
  { id: "o6", m: "mB", inst: "GOOGL US", cat: "Equity", side: "Buy", qty: "2,100", px: "$176.30", not: "$370.2k", notVal: 370_200, ref: "TRD-88192", ib: "IB-40161", st: "ok",
    execs: [{ id: "x1", qty: "2,100", px: "$176.30", t: "12:45:03", st: "ok" }] },
  { id: "o7", m: "mC", inst: "V US", cat: "Equity", side: "Buy", qty: "3,000", px: "$289.15", not: "$867.5k", notVal: 867_500, ref: "TRD-88224", ib: "IB-40217", st: "ok",
    execs: [{ id: "x1", qty: "3,000", px: "$289.15", t: "14:22:10", st: "ok" }] },
  { id: "o8", m: "mC", inst: "HSBC LN", cat: "Equity", side: "Buy", qty: "40,000", px: "GBP 6.82", not: "£272.8k", notVal: 346_500, ref: "TRD-88190", ib: "IB-40170", st: "ok",
    execs: [{ id: "x1", qty: "40,000", px: "GBP 6.82", t: "13:10:45", st: "ok" }] },
];

const ORDERS_IB_BREAK: RcOrder[] = ORDERS_CLEAN.map((o) => {
  if (o.id === "o2") {
    return {
      ...o, notVal: 2_666_230, not: "$2.67M",
      execs: [
        { id: "x1", qty: "3,000", px: "$410.20", t: "10:02:11", st: "ok" as const },
        { id: "x2", qty: "3,500", px: "$410.18", t: "10:05:39", st: "ok" as const },
      ],
    };
  }
  return o;
});

/* ---- reconciliation engine -----------------------------------
   Derives IB Client allocations from orders + allocation matrix.
   Compares AlgoTrade orders vs IB-reported fills to flag breaks.
   CRM portfolio mirrors IB (IB <-> CRM always in sync).
   ---------------------------------------------------------------- */
function rcModelNot(orders: RcOrder[], mid: RcModelId): number {
  return orders.filter((o) => o.m === mid).reduce((s, o) => s + o.notVal, 0);
}
function rcTotalNot(orders: RcOrder[]): number {
  return orders.reduce((s, o) => s + o.notVal, 0);
}

function rcBuildAllocs(ibOrders: RcOrder[], algoOrders: RcOrder[]): RcAlloc[] {
  return CLIENT_META.map(({ cid, client }) => {
    const models: RcAllocModelLine[] = RC_MODELS
      .filter((mid) => ALLOC_UNITS[`${cid}-${mid}`])
      .map((mid) => {
        const share = rcClientShare(cid, mid);
        const ibAmt = rcModelNot(ibOrders, mid) * share;
        const algoAmt = rcModelNot(algoOrders, mid) * share;
        const hasBrk = Math.abs(ibAmt - algoAmt) > 100;
        return {
          m: mid,
          units: ALLOC_UNITS[`${cid}-${mid}`],
          amt: fmtUsd(ibAmt),
          amtVal: ibAmt,
          st: hasBrk ? "brk" : "ok",
          note: hasBrk ? `Expected ${fmtUsd(algoAmt)} from AlgoTrade` : undefined,
        };
      });
    const totalVal = models.reduce((s, m) => s + m.amtVal, 0);
    const hasBrk = models.some((m) => m.st !== "ok");
    return { cid, client, st: hasBrk ? "brk" as const : "ok" as const, total: fmtUsd(totalVal), totalVal, models };
  }).filter((c) => c.models.length > 0);
}

function rcBuildPorts(allocs: RcAlloc[]): RcPort[] {
  return allocs.map((a) => {
    const meta = CLIENT_META.find((c) => c.cid === a.cid)!;
    const pre = meta.preAum;
    const post = pre + a.totalVal;
    const pctChg = ((a.totalVal / pre) * 100).toFixed(1);
    return {
      cid: a.cid, client: a.client, st: "ok",
      pre: fmtUsd(pre), post: fmtUsd(post), chg: `+${fmtUsd(a.totalVal)}`, pct: `+${pctChg}%`,
      inTrade: Math.round(post * 0.75), cash: Math.round(post * 0.25), total: Math.round(post),
    };
  });
}

interface FlowScenario {
  orders: RcOrder[];
  allocs: RcAlloc[];
  ports: RcPort[];
  algoTotal: number;
  ibTotal: number;
  crmTotal: number;
}

function rcBuildScenario(algoOrders: RcOrder[], ibOrders: RcOrder[]): FlowScenario {
  const orders: RcOrder[] = algoOrders.map((ao) => {
    const io = ibOrders.find((o) => o.id === ao.id);
    if (!io || Math.abs(ao.notVal - io.notVal) < 100) return ao;
    return { ...ao, st: "brk", brk: `${fmtUsd(ao.notVal)} Ordered vs ${fmtUsd(io.notVal)} Confirmed by IB`, execs: io.execs };
  });
  const allocs = rcBuildAllocs(ibOrders, algoOrders);
  const ports = rcBuildPorts(allocs);
  return {
    orders, allocs, ports,
    algoTotal: rcTotalNot(algoOrders),
    ibTotal: rcTotalNot(ibOrders),
    crmTotal: rcTotalNot(ibOrders),
  };
}

export const SCENARIOS: Record<RcScenarioKey, FlowScenario> = {
  "all-ok": rcBuildScenario(ORDERS_CLEAN, ORDERS_CLEAN),
  breaks: rcBuildScenario(ORDERS_CLEAN, ORDERS_IB_BREAK),
};
