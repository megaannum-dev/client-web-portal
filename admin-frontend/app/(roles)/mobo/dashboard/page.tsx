"use client";

/* ============================================================
   MOBO Dashboard — operations control tower
   Ported from the design handoff (MoboDashboard.jsx).
   ============================================================ */

import { useRouter } from "next/navigation";
import {
  CalendarDays, ArrowLeftRight, Inbox, Link2, Unlink, ShieldAlert,
  ArrowRight, Clock, ChevronRight, FileText, Lock,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar } from "@/components/mobo/Shared";
import {
  RECON_SUMMARY, EXCEPTIONS, FEEDS, SETTLE_DAY, SEV_LABEL, SEV_TONE,
  type Feed, type Exception,
} from "@/lib/mock/mobo-data";

const FEED_DOT: Record<string, string> = { ok: "#16a34a", brk: "#ea580c", miss: "#ba1a1a" };

function FeedRow({ f }: { f: Feed }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <span className="flex items-center gap-2.5 text-[13.5px] font-semibold text-on-surface">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FEED_DOT[f.state] ?? "#8b7264" }} />
        {f.name}
      </span>
      <span className="whitespace-nowrap text-[11.5px] text-secondary">{f.note}</span>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[7px] text-[12.5px] text-secondary">
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {label} <b className="tabular-nums text-on-surface">{value}</b>
    </span>
  );
}

function ExcRow({ e, onClick }: { e: Exception; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors duration-100 hover:bg-surface-container [&>td]:border-t [&>td]:border-outline-variant"
    >
      <td className="px-[18px] py-3">
        <div className="font-bold text-on-surface">{e.ref}</div>
        <div className="mt-px text-[12px] text-secondary">{e.book} · {e.inst}</div>
      </td>
      <td className="px-[18px] py-3 text-on-surface">{e.type}</td>
      <td className="px-[18px] py-3"><Chip tone={SEV_TONE[e.sev]} dot={false}>{SEV_LABEL[e.sev]}</Chip></td>
      <td
        className="px-[18px] py-3 text-right tabular-nums"
        style={{ fontWeight: e.carried ? 700 : 400, color: e.carried ? "#ba1a1a" : "var(--secondary)" }}
      >
        {e.carried && <Clock size={11} strokeWidth={2} className="mr-[3px] inline align-[-1px]" />}{e.age}
      </td>
      <td className="px-[18px] py-3" style={{ color: e.owner === "Unassigned" ? "var(--secondary)" : "var(--on-surface)" }}>
        {e.owner}
      </td>
      <td className="px-[18px] py-3 text-right text-secondary">
        <ChevronRight size={16} strokeWidth={2} className="inline" />
      </td>
    </tr>
  );
}

const CARD = "rounded-2xl border border-outline-variant bg-surface-lowest shadow-card";

export default function MoboDashboardPage() {
  const router = useRouter();
  const R = RECON_SUMMARY;
  const openBreaks = R.breaks + R.unmatched;
  const top = EXCEPTIONS.slice(0, 5);
  const okFeeds = FEEDS.filter((f) => f.state === "ok").length;

  const goRecon = () => router.push("/mobo/trade-reconciliation");
  const goExceptions = () => router.push("/mobo/daily-exception-report");

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <PageHeader
          title="Dashboard"
          subtitle={`Middle & back office · Settlement day ${SETTLE_DAY}`}
          actions={
            <>
              <Button variant="secondary" icon={CalendarDays}>03 Jun 2026</Button>
              <Button icon={ArrowLeftRight} onClick={goRecon}>Run reconciliation</Button>
            </>
          }
        />
      </div>

      {/* four counters */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricStat label="Trades to reconcile" value="1,284" icon={Inbox} />
        <MetricStat label="Auto-matched" value="96.4%" sub="1,261" tone="ok" icon={Link2} />
        <MetricStat label="Open breaks" value={openBreaks} sub="12 field · 11 unmatched" tone="warn" icon={Unlink} onClick={goRecon} />
        <MetricStat label="Open exceptions" value="7" sub="2 carried fwd" tone="bad" icon={ShieldAlert} onClick={goExceptions} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        {/* LEFT column */}
        <div className="flex flex-col gap-6">
          {/* Today's reconciliation */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-on-surface">Today&apos;s reconciliation</h3>
              <Chip tone="warm" dot={false}>In progress</Chip>
            </div>
            <SegBar ok={82} warn={11} bad={7} />
            <div className="mt-3.5 flex flex-wrap items-center gap-[18px]">
              <Legend color="#3f9d63" label="Matched" value="1,261" />
              <Legend color="#e0922f" label="Breaks" value="12" />
              <Legend color="#d3654f" label="Unmatched" value="11" />
              <button
                type="button"
                onClick={goRecon}
                className="ml-auto flex items-center gap-[5px] text-[13px] font-bold text-primary hover:opacity-75"
              >
                Continue reconciliation <ArrowRight size={15} strokeWidth={2} />
              </button>
            </div>
          </section>

          {/* Open exceptions */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h3 className="text-[17px] font-semibold text-on-surface">Open exceptions</h3>
              <button
                type="button"
                onClick={goExceptions}
                className="text-[13px] font-bold text-primary hover:opacity-75"
              >
                View report →
              </button>
            </header>
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["Ref / Book", "Type", "Severity", "Age", "Owner", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`bg-surface-low px-[18px] py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${i === 3 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((e) => (
                  <ExcRow key={e.id} e={e} onClick={goExceptions} />
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-6">
          {/* Feeds & cutoffs */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-[15px] flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-on-surface">Feeds &amp; cutoffs</h3>
              <span className="text-[12.5px] font-bold text-secondary">{okFeeds} / {FEEDS.length}</span>
            </div>
            <div className="flex flex-col gap-[13px]">
              {FEEDS.map((f, i) => <FeedRow key={i} f={f} />)}
              <div className="mt-0.5 flex items-center justify-between border-t border-outline-variant pt-[13px]">
                <span className="text-[12.5px] text-secondary">Settlement cutoff</span>
                <span className="text-[13.5px] font-bold text-on-surface">18:00 GMT</span>
              </div>
            </div>
          </section>

          {/* End-of-day report */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-on-surface">End-of-day report</h3>
              <Chip tone="warm" dot={false}>Draft</Chip>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13.5px] text-secondary">Breaks outstanding</span>
              <span className="text-[18px] font-bold text-on-surface">7</span>
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13.5px] text-secondary">Yesterday</span>
              <Chip tone="active" dot={false}>Signed off</Chip>
            </div>
            <div className="flex gap-2.5">
              <Button variant="secondary" icon={FileText} full onClick={goExceptions}>Preview</Button>
              <Button icon={Lock} full disabled>Sign off</Button>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.45] text-secondary">
              Sign-off unlocks when open breaks reach zero.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
