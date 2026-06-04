"use client";

/* ============================================================
   MOBO Daily Exception Report
   The signed end-of-day report artifact (rolls up into the
   Monthly Report). Sign-off gated on zero open breaks.
   Ported from the design handoff (MoboExceptions.jsx).
   ============================================================ */

import { Download, Lock } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/mobo/Shared";
import { EOD } from "@/lib/mock/mobo-data";

function Rollup({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        background: accent ? "rgba(242,116,5,0.07)" : "var(--surface-low)",
        border: `1px solid ${accent ? "rgba(242,116,5,0.22)" : "var(--outline-variant)"}`,
      }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{k}</div>
      <div
        className="mt-[5px] text-[26px] font-bold tabular-nums tracking-[-0.02em]"
        style={{ color: accent ? "var(--primary)" : "var(--on-surface)" }}
      >
        {v}
      </div>
    </div>
  );
}

function SignLine({ cap }: { cap: string }) {
  return (
    <div>
      <div className="h-9 w-[200px] border-b-[1.5px] border-outline" />
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{cap}</div>
    </div>
  );
}

export default function DailyExceptionReportPage() {
  const ticks = Array.from({ length: EOD.daysInMonth }).map((_, i) => {
    const today = i === EOD.dayOf - 1;
    const past = i < EOD.dayOf;
    const h = past ? 34 + i * 16 : 18 + ((i * 37) % 22);
    return (
      <span
        key={i}
        className="flex-1 rounded-[2px]"
        style={{ height: `${h}%`, background: today ? "var(--primary)" : past ? "#d8b59c" : "var(--outline-variant)" }}
      />
    );
  });

  const numCls = "px-4 py-[11px] text-right tabular-nums text-on-surface border-t border-outline-variant";
  const txtCls = "px-4 py-[11px] text-left text-on-surface border-t border-outline-variant";

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <PageHeader
          title="Daily Exception Report"
          subtitle="7 open · 2 carried forward · settlement day 03 Jun 2026"
          actions={<Button variant="secondary" icon={Download}>Export</Button>}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-card">
        {/* band */}
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant bg-surface-low px-6 py-5">
          <div>
            <div className="text-[20px] font-bold tracking-[-0.01em] text-on-surface">Daily Exception Report</div>
            <div className="mt-1 text-[12.5px] text-secondary">
              Settlement day · Tue 03 Jun 2026 · Middle &amp; Back Office · Generated {EOD.generated}
            </div>
          </div>
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-primary text-[14px] font-extrabold tracking-[0.06em] text-primary">
            EOD
          </span>
        </div>

        <div className="px-6 py-[22px]">
          {/* rollup tiles */}
          <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Rollup k="Trades reconciled" v="1,284" />
            <Rollup k="Breaks raised" v="18" />
            <Rollup k="Resolved" v="11" />
            <Rollup k="Carried forward" v="7" accent />
          </div>

          <Eyebrow>Exceptions by type</Eyebrow>
          <div className="mb-6 overflow-hidden rounded-xl border border-outline-variant">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["Type", "Raised", "Resolved", "Carried fwd"].map((h, i) => (
                    <th
                      key={i}
                      className={`bg-surface-low px-4 py-[11px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${i ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EOD.byType.map((r, i) => (
                  <tr key={i}>
                    <td className={`${txtCls} font-bold`}>{r.type}</td>
                    <td className={numCls}>{r.raised}</td>
                    <td className={numCls}>{r.resolved}</td>
                    <td className={numCls}>{r.carried}</td>
                  </tr>
                ))}
                <tr className="bg-surface-low">
                  <td className={`${txtCls} font-bold`}>Total</td>
                  <td className={`${numCls} font-bold`}>18</td>
                  <td className={`${numCls} font-bold`}>11</td>
                  <td className={`${numCls} font-bold`}>7</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* aggregation strip */}
          <div className="flex items-center gap-[18px] rounded-xl border border-outline-variant bg-surface-low px-4 py-3.5">
            <div className="flex h-10 w-[220px] shrink-0 items-end gap-[3px]">{ticks}</div>
            <span className="text-[13px] leading-[1.45] text-secondary">
              <b className="text-on-surface">Day {EOD.dayOf} of {EOD.daysInMonth}</b> — this signed daily record rolls into the{" "}
              <b className="text-on-surface">June Monthly Report</b>.
            </span>
          </div>
        </div>

        {/* footer / sign-off */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-outline-variant bg-surface-lowest px-6 py-[18px]">
          <div className="flex flex-wrap gap-9">
            <SignLine cap="Prepared by · MOBO Analyst" />
            <SignLine cap="Reviewed by · Supervisor" />
          </div>
          <div className="flex items-center gap-3.5">
            <span className="max-w-[200px] text-right text-[12px] text-secondary">Locked until 7 open breaks are cleared.</span>
            <Button icon={Lock} disabled>Sign off &amp; lock</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
