"use client";

/* ============================================================
   MegaCRM — PC · Allocation Matrix (hi-fi page)
   Framing A — the matrix is the resting surface; clicking a cell
   floats in the per-allocation detail (units, derived fund, the
   model's one linked IB account). Plus edit (linked units ↔ fund
   with validation), an irreversible period lock, and the empty
   new-period state.

   Ported faithfully from the design prototype (AllocationMatrix.jsx).
   Adaptations (ship the baked product, not the tweakable demo):
     - acctScope baked to "model" (per-model IB account); the host
       "Tweaks" branch + per-client scope is dropped (as MOBO did).
     - flow-canvas `initial*` props dropped — internal useState with
       the prototype's resting defaults. The matrix renders `locked`
       (cells show "—" / stay clickable → DetailPanel) and the panel
       is read-only, matching the prototype's resting render.

   Data flows ONLY through the loadAllocation() seam + AllocationView
   methods; no fund/units math is recomputed inline.
   ============================================================ */

import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays, ChevronDown, Check, Lock, Eye, Grid3x3, RefreshCw,
  Briefcase, Minus, Plus, Link, UserRound, TriangleAlert, History, X, Pencil,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Eyebrow, Modal, Fact } from "@/components/pc/Shared";
import { loadAllocation, type AllocationView } from "@/lib/pc/allocation";
import { fmtMoney, fmtMoneyShort } from "@/lib/pc/models";

type Toggle = "units" | "pct";
interface Coord { cid: string; mid: string }

/* shared uppercase label (amLabel) — matches Eyebrow but inline */
const LABEL = "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

/* ============================================================
   STAT STRIP
   ============================================================ */
function StatStrip({ view, period }: { view: AllocationView; period: string }) {
  const stats: { k: string; v: ReactNode; icon?: boolean }[] = [
    { k: "Allocation period", v: period, icon: true },
    { k: "Clients allocated", v: view.clients.length },
    { k: "Live models", v: view.liveModels.length },
    { k: "Total account fund", v: fmtMoneyShort(view.totalFund()) },
  ];
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      {stats.map((s) => (
        <div
          key={s.k}
          className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card"
        >
          <div className={`flex items-center gap-1.5 ${LABEL}`}>
            {s.icon && <CalendarDays size={13} strokeWidth={2} />}
            {s.k}
          </div>
          <div className="mt-2 text-[24px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
            {s.v}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   PERIOD PICKER  ·  preview historical matrices
   ============================================================ */
function PeriodPicker({
  view, period, onPick,
}: { view: AllocationView; period: string; onPick: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Switch period · preview a historical matrix"
        className={[
          "box-border inline-flex h-[42px] cursor-pointer items-center gap-2 rounded border border-outline px-[13px]",
          "text-[14px] font-bold text-on-surface",
          open ? "bg-surface-low" : "bg-white",
        ].join(" ")}
      >
        <CalendarDays size={15} strokeWidth={2} />
        {period}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="text-secondary transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-20" />
          <div className="absolute left-0 top-[calc(100%+6px)] z-[21] min-w-[232px] overflow-hidden rounded-md border border-outline-variant bg-surface-lowest p-1.5 shadow-overlay">
            <div className={`${LABEL} px-2.5 pb-[5px] pt-[7px]`}>Allocation period</div>
            {view.periods.map((p) => {
              const sel = p.label === period;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onPick(p.label); setOpen(false); }}
                  className={[
                    "flex w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-[9px] text-left text-[13.5px] text-on-surface",
                    sel ? "bg-surface-low" : "bg-transparent",
                  ].join(" ")}
                >
                  <span className={`flex-1 ${sel ? "font-bold" : "font-semibold"}`}>{p.label}</span>
                  {p.status === "open" ? (
                    <span className="rounded-[6px] bg-primary-fixed px-[7px] py-0.5 text-[11px] font-bold text-primary">
                      Open
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary">
                      <Lock size={11} strokeWidth={2} />Locked
                    </span>
                  )}
                  {sel && <Check size={15} strokeWidth={2.2} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   VIEW TOGGLE  ·  × Units / % Share
   ============================================================ */
function ViewToggle({ view, onView }: { view: Toggle; onView: (v: Toggle) => void }) {
  const opts: [Toggle, string][] = [["units", "× Units"], ["pct", "% Share"]];
  return (
    <div
      className="flex overflow-hidden rounded border border-outline"
      title="Show each allocation as a multiplier or its share of the model"
    >
      {opts.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onView(k)}
          className={[
            "box-border flex h-10 cursor-pointer items-center justify-center px-[15px] text-[13.5px] font-bold transition-all duration-150",
            view === k ? "bg-primary text-white" : "bg-white text-secondary",
          ].join(" ")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   THE MATRIX  (client rows × active-model columns)
   ============================================================ */
const TH =
  "border-b-0 bg-surface-low px-4 py-[13px] text-left align-top text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";

function Matrix({
  data, view, locked, onOpen,
}: {
  data: AllocationView;
  view: Toggle;
  locked: boolean;
  onOpen: (cid: string, mid: string) => void;
}) {
  const cols = data.liveModels;

  const cellPrimary = (units: number, mid: string): string => {
    if (view === "pct") {
      const t = data.colUnits(mid);
      return t ? Math.round((units / t) * 100) + "%" : "0%";
    }
    return units + "×";
  };

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-[1]`}>Client \ Model</th>
              {cols.map((m) => (
                <th key={m.id} className={`${TH} min-w-[150px]`}>
                  <div className="text-[13.5px] font-bold normal-case tracking-[-0.01em] text-on-surface">
                    {m.name}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold normal-case tracking-[0.02em] text-secondary">
                    {m.acct} · {fmtMoneyShort(m.notional)} / unit
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.clients.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-[1] whitespace-nowrap border-t border-outline-variant bg-surface-lowest px-4 py-[13px]">
                  <div className="text-[14px] font-bold text-on-surface">{c.name}</div>
                  <div className="mt-0.5 text-[12px] tabular-nums text-secondary">{c.code}</div>
                </td>
                {cols.map((m) => (
                  <MatrixCell
                    key={m.id}
                    data={data}
                    cid={c.id}
                    mid={m.id}
                    locked={locked}
                    primary={cellPrimary}
                    onOpen={onOpen}
                  />
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-[1] whitespace-nowrap border-t-2 border-outline bg-surface-low px-4 py-[13px] text-[12.5px] font-bold text-on-surface">
                Total per model
              </td>
              {cols.map((m) => {
                const u = data.colUnits(m.id);
                const f = data.colFund(m.id);
                return (
                  <td key={m.id} className="border-t-2 border-outline bg-surface-low px-4 py-[13px]">
                    <div className="text-[15px] font-bold tabular-nums text-on-surface">
                      {view === "pct" ? "100%" : u + "×"}
                    </div>
                    <div className="mt-[3px] text-[12px] font-semibold tabular-nums text-secondary">
                      {fmtMoneyShort(f)}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixCell({
  data, cid, mid, locked, primary, onOpen,
}: {
  data: AllocationView;
  cid: string;
  mid: string;
  locked: boolean;
  primary: (units: number, mid: string) => string;
  onOpen: (cid: string, mid: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const cell = data.cell(cid, mid);

  if (!cell || !cell.units) {
    return (
      <td
        className="min-w-[150px] border-t border-outline-variant px-4 py-3 align-top"
        style={{ cursor: locked ? "default" : "pointer", background: hover && !locked ? "rgb(var(--color-surface-low))" : "transparent" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => !locked && onOpen(cid, mid)}
      >
        {locked ? (
          <span className="text-outline">—</span>
        ) : (
          <span className={`inline-flex items-center gap-1 text-[12.5px] font-bold ${hover ? "text-primary" : "text-secondary"}`}>
            <Plus size={13} strokeWidth={2.2} />assign
          </span>
        )}
      </td>
    );
  }
  return (
    <td
      className="min-w-[150px] cursor-pointer border-t border-outline-variant px-4 py-3 align-top transition-colors"
      style={{ background: hover ? "rgb(var(--color-surface-low))" : "transparent" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(cid, mid)}
    >
      <div className="text-[17px] font-bold tabular-nums tracking-[-0.01em] text-on-surface">
        {primary(cell.units, mid)}
      </div>
      <div className="mt-[3px] text-[12.5px] font-semibold tabular-nums text-secondary">
        {fmtMoneyShort(data.cellFund(cid, mid))}
      </div>
    </td>
  );
}

/* ============================================================
   FLOATING ALLOCATION DETAIL  (framing A — rounded card from right)
   ============================================================ */
function DetailPanel({
  data, period, cid, mid, readOnly, onClose, onEdit,
}: {
  data: AllocationView;
  period: string;
  cid: string;
  mid: string;
  readOnly: boolean;
  onClose: () => void;
  onEdit: (cid: string, mid: string) => void;
}) {
  const c = data.clientById(cid);
  const m = data.modelById(mid);
  const cell = data.cell(cid, mid);
  if (!c || !m || !cell) return null;
  const fund = data.cellFund(cid, mid);

  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 z-[8]"
        style={{ background: "rgba(40,38,34,0.18)" }}
      />
      <div
        className="absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex w-[432px] max-w-[calc(100%-36px)] flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-4 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-bold tracking-[-0.01em]">
                {c.name} <span className="font-semibold text-secondary">×</span> {m.name}
              </div>
              <div className="mt-1 text-[13px] text-secondary">
                {c.code} · pre-trade allocation · {period}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex flex-none cursor-pointer p-[3px] text-secondary"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] py-5">
          <div className="grid grid-cols-2 gap-[11px]">
            <Fact label="Model units" value={cell.units + "×"} />
            <Fact label="Account fund" value={fmtMoney(fund)} />
            <Fact label="Model notional" value={fmtMoneyShort(m.notional)} sub="/ unit" />
            <Fact label="Min account fund" value={fmtMoney(m.notional)} sub="= 1 unit" />
          </div>

          <Eyebrow className="mb-[9px] mt-5">Linked IB account</Eyebrow>
          <div className="flex items-center gap-3 rounded-md border border-outline-variant bg-surface-low px-[15px] py-[13px]">
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-primary-fixed text-primary">
              <Briefcase size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tabular-nums">{m.acct}</div>
              <div className="mt-0.5 text-[12.5px] text-secondary">
                {m.name} · trades 100% of this allocation
              </div>
            </div>
            <Chip tone="neutral" dot={false}>
              <Lock size={11} strokeWidth={2} className="mr-[3px]" />per model
            </Chip>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   EDIT ALLOCATION (linked units ↔ fund, validated) — F3 Modal shell
   ============================================================ */
function EditModal({
  data, cid, mid, onClose,
}: {
  data: AllocationView;
  cid: string;
  mid: string;
  onClose: () => void;
}) {
  const c = data.clientById(cid);
  const m = data.modelById(mid);
  const cell = data.cell(cid, mid) ?? { units: 1 };

  const notional = m?.notional ?? 0;
  const acct = m?.acct ?? "";

  const [units, setUnits] = useState(cell.units);
  const [fundStr, setFundStr] = useState(fmtMoney(cell.units * notional));
  const [err, setErr] = useState("");

  if (!c || !m) return null;

  const minMsg = "Model units can’t go below 1 — that’s the minimum (one unit).";

  const syncFromUnits = (n: number) => {
    const clamped = Math.max(1, Math.floor(n || 0));
    setUnits(clamped);
    setFundStr(fmtMoney(clamped * notional));
    setErr(n < 1 || !Number.isFinite(n) ? minMsg : "");
  };
  const onUnitsInput = (raw: string) => {
    const n = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
    if (!Number.isFinite(n) || n < 1) {
      setErr(minMsg);
      setUnits(Number.isFinite(n) ? n : 1);
      return;
    }
    syncFromUnits(n);
  };
  const onFundInput = (raw: string) => {
    setFundStr(raw);
    const v = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
    if (v < notional) {
      setErr(`Account fund can’t go below ${fmtMoney(notional)} — ${m.name}’s notional (one unit).`);
      return;
    }
    setErr("");
    setUnits(Math.round(v / notional));
  };
  const onFundBlur = () => {
    const v = parseInt(fundStr.replace(/[^0-9]/g, ""), 10) || 0;
    const u = Math.max(1, Math.round(v / notional));
    setUnits(u);
    setFundStr(fmtMoney(u * notional));
    setErr("");
  };

  const invalid = !!err || units < 1;

  const StepperBtn = ({ dir }: { dir: -1 | 1 }) => {
    const disabled = dir < 0 && units <= 1;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => syncFromUnits(units + dir)}
        className={[
          "flex h-10 w-[38px] flex-none items-center justify-center border border-outline-variant",
          disabled ? "cursor-not-allowed bg-surface-low text-outline" : "cursor-pointer bg-white text-on-surface",
        ].join(" ")}
      >
        {dir < 0 ? <Minus size={16} strokeWidth={2.2} /> : <Plus size={16} strokeWidth={2.2} />}
      </button>
    );
  };

  const inputBorder = invalid ? "border-error" : "border-outline-variant";

  return (
    <Modal
      title={`Edit allocation · ${c.name} × ${m.name}`}
      subtitle="Set the model units or the account fund — they’re linked, so changing one updates the other."
      onClose={onClose}
      width={540}
      centered
      footer={
        <>
          <span className="mr-auto flex items-center gap-[7px] text-[12.5px] text-secondary">
            <Briefcase size={14} strokeWidth={2} />Routes through {acct} ({m.name}’s IB account)
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Check} onClick={onClose} disabled={invalid}>Save allocation</Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3.5">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>Model units (multiplier)</span>
          <div className={`flex overflow-hidden rounded border ${inputBorder}`}>
            <StepperBtn dir={-1} />
            <input
              value={units}
              onChange={(e) => onUnitsInput(e.target.value)}
              inputMode="numeric"
              className="box-border min-w-0 flex-1 border-x border-outline-variant bg-white text-center text-[16px] font-bold text-on-surface outline-none"
            />
            <StepperBtn dir={1} />
          </div>
        </label>
        <div
          className="flex h-10 items-center justify-center text-secondary"
          title="Linked — editing either updates the other"
        >
          <Link size={16} strokeWidth={2} />
        </div>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>Account fund</span>
          <input
            value={fundStr}
            onChange={(e) => onFundInput(e.target.value)}
            onBlur={onFundBlur}
            className={`box-border h-10 min-w-0 rounded border px-3 text-[16px] font-bold tabular-nums text-on-surface outline-none ${inputBorder} bg-white`}
          />
        </label>
      </div>

      {err ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-[9px] border px-3 py-2.5 text-[12.5px] font-semibold text-error"
          style={{ background: "#ffeceb", borderColor: "#ffd5d2" }}
        >
          <TriangleAlert size={15} strokeWidth={2} className="flex-none" />
          {err}
        </div>
      ) : (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-secondary">
          Linked — fund = units × {fmtMoney(notional)} notional. The fund can’t drop below{" "}
          {fmtMoney(notional)} (one unit); units can’t go below 1.
        </p>
      )}

      <div className="mt-[18px]">
        <div className={LABEL}>Linked IB account</div>
        <div className="mt-2 flex items-center gap-3 rounded-md border border-outline-variant bg-surface-low px-[15px] py-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded bg-primary-fixed text-primary">
            <Briefcase size={17} strokeWidth={1.75} />
          </span>
          <div className="flex-1">
            <div className="text-[14.5px] font-bold tabular-nums">{acct}</div>
            <div className="mt-0.5 text-[12.5px] text-secondary">
              Inherited from {m.name} · one IB account per model
            </div>
          </div>
          <Chip tone="neutral" dot={false}>
            <Lock size={11} strokeWidth={2} className="mr-[3px]" />per model
          </Chip>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   LOCK CONFIRM MODAL  (irreversible until next period) — F3 Modal shell
   ============================================================ */
function LockModal({
  data, period, onClose, onConfirm,
}: {
  data: AllocationView;
  period: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={`Lock ${period} allocation?`}
      subtitle="Locking freezes the matrix for the period so trading can open."
      onClose={onClose}
      width={470}
      centered
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button icon={Lock} onClick={onConfirm}>Lock allocation</Button>
        </>
      }
    >
      <div className="flex gap-[13px]">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-primary-fixed text-primary">
          <Lock size={20} strokeWidth={1.75} />
        </span>
        <div className="text-[13.5px] leading-[1.6] text-secondary">
          <b className="text-on-surface">{data.count()} allocations</b> across {data.liveModels.length} live models are ready to lock.
        </div>
      </div>
      <div
        className="mt-3.5 flex items-start gap-[9px] rounded-[10px] border px-[13px] py-[11px] text-[12.5px] font-semibold leading-[1.55]"
        style={{ color: "#9a5b00", background: "#fff6e6", borderColor: "#ffe2b0" }}
      >
        <TriangleAlert size={15} strokeWidth={2} className="mt-px flex-none" />
        <span>This can’t be undone. The matrix and entry editing stay locked until the next allocation period opens.</span>
      </div>
    </Modal>
  );
}

/* ============================================================
   EMPTY / NEW-PERIOD STATE
   ============================================================ */
function EmptyPeriod({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-lowest p-6 shadow-card">
      <div className="flex flex-col items-center gap-3.5 px-5 py-[72px] text-center">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-lg bg-surface-low text-secondary">
          <Grid3x3 size={26} strokeWidth={1.75} />
        </span>
        <div className="text-[18px] font-bold text-on-surface">No allocation matrix available</div>
        <Button icon={RefreshCw} onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function AllocationMatrixPage() {
  const data = useMemo(() => loadAllocation(), []);
  const PERIOD = data.openPeriod;

  const [view, setView] = useState<Toggle>("units");
  const [period, setPeriod] = useState(PERIOD);
  const [open, setOpen] = useState<Coord | null>(null);       // floating detail
  const [edit, setEdit] = useState<Coord | null>(null);       // edit modal
  const [lockConfirm, setLockConfirm] = useState(false);
  const [locked, setLocked] = useState(false);
  const [empty] = useState(false);

  const historical = period !== PERIOD;                       // previewing a past period
  const onOpen = (cid: string, mid: string) => setOpen({ cid, mid });
  const onEdit = (cid: string, mid: string) => { setOpen(null); setEdit({ cid, mid }); };

  return (
    // Full-bleed work surface: negative margins cancel <main>'s p-8 px-16 so
    // the relative root (and every absolute inset-0 backdrop + the floating
    // detail panel) covers the entire content area, padding included. The
    // inner wrapper re-applies that padding so content stays put. min-h fills
    // the shell content area (viewport − 64px header).
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PeriodPicker view={data} period={period} onPick={setPeriod} />
              <p className="text-[15px] text-secondary">
                {historical ? "Historical · read-only" : "Pre-trade allocation · review & lock"} · {data.clients.length} clients · {data.liveModels.length} live models
              </p>
            </div>
          </div>
          {!empty && (
            <div className="flex items-center gap-3">
              <ViewToggle view={view} onView={setView} />
              {historical ? (
                <Button variant="secondary" icon={Eye} disabled>Read-only preview</Button>
              ) : locked ? (
                <Button variant="secondary" icon={Lock} disabled>Locked until next period</Button>
              ) : (
                <Button icon={Lock} onClick={() => setLockConfirm(true)}>Lock allocation</Button>
              )}
            </div>
          )}
        </div>

        {empty ? (
          <EmptyPeriod onRetry={() => {}} />
        ) : (
          <>
            <StatStrip view={data} period={period} />
            {historical && (
              <div className="mb-[18px] flex items-start gap-3 rounded-md border border-outline-variant bg-surface-low px-4 py-[13px]">
                <span className="mt-px flex flex-none text-secondary">
                  <History size={18} strokeWidth={2} />
                </span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-on-surface">Previewing {period} · historical</div>
                  <div className="mt-0.5 text-[12.5px] text-secondary">
                    This is a locked past period, shown read-only. Switch back to {PERIOD} to edit the open allocation.
                  </div>
                </div>
              </div>
            )}
            {locked && !historical && (
              <div
                className="mb-[18px] flex items-start gap-3 rounded-md border px-4 py-[13px]"
                style={{ background: "#fff6e6", borderColor: "#ffe2b0" }}
              >
                <span className="mt-px flex flex-none" style={{ color: "#9a5b00" }}>
                  <Lock size={18} strokeWidth={2} />
                </span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-on-surface">{PERIOD} allocation is locked</div>
                  <div className="mt-0.5 text-[12.5px]" style={{ color: "#9a5b00" }}>
                    The matrix is frozen so trading can open. This can’t be undone — locking and entry editing stay disabled until the next allocation period opens.
                  </div>
                </div>
              </div>
            )}
            <Matrix data={data} view={view} locked onOpen={onOpen} />
          </>
        )}
      </div>

      {open && (
        <DetailPanel
          data={data}
          period={PERIOD}
          cid={open.cid}
          mid={open.mid}
          readOnly
          onClose={() => setOpen(null)}
          onEdit={onEdit}
        />
      )}
      {edit && (
        <EditModal data={data} cid={edit.cid} mid={edit.mid} onClose={() => setEdit(null)} />
      )}
      {lockConfirm && (
        <LockModal
          data={data}
          period={PERIOD}
          onClose={() => setLockConfirm(false)}
          onConfirm={() => { setLockConfirm(false); setLocked(true); }}
        />
      )}
    </div>
  );
}
