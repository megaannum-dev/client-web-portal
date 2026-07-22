"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  UserRoundPlus,
  CalendarClock,
  ChevronRight,
  Inbox,
  Search,
  X,
  SlidersHorizontal,
  SearchX,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { RailAccordion } from "@/components/rm/SummaryCard";
import {
  RENEWALS_DUE,
  REQUEST_TICKETS,
  getMockOverlay,
  type SummaryItem,
} from "@/lib/mock/rm-data";
import { useAuth } from "@/components/auth/AuthProvider";
import { useClientBook } from "@/hooks/api/useClientBook";
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";
import { COLUMN_LABELS } from "@/lib/onboarding/mappers";
import type { KycBoardClient, OnboardingStatus } from "@/lib/onboarding/types";
import { ADV_FIELDS } from "@/lib/rm/client-search-fields";
import type { ClientRow } from "@/lib/rm/clients";

// Mirrors client-info/[id]/page.tsx's own ONBOARDING_STATUS_TONE lookup —
// duplicated rather than shared since that file doesn't export it (FE-4 scope).
const ONBOARDING_TONE: Record<OnboardingStatus, ChipTone> = {
  initial: "neutral", reviewing: "review", pending_review: "pending", active: "active",
};

const emptyAdv = () => Object.fromEntries(ADV_FIELDS.map((f) => [f.key, ""]));

// ponytail: case-sensitive by request — no .toLowerCase() here, trim only.
const norm = (s: string) => s.trim();

function matchClient(c: ClientRow, needle: string): boolean {
  if (!needle) return true;
  const hay = ADV_FIELDS.map((f) => f.get(c)).join(" | ");
  return norm(hay).includes(needle);
}

function matchAdv(c: ClientRow, active: Record<string, string>): boolean {
  return Object.entries(active).every(([k, v]) => {
    if (!norm(v ?? "")) return true;
    const f = ADV_FIELDS.find((x) => x.key === k);
    return f ? norm(f.get(c)).includes(norm(v)) : true;
  });
}

export default function RmDashboardPage() {
  const router = useRouter();
  const rmName = useAuth().portalUser?.name;
  const { data, loading, error } = useClientBook();
  const { data: board } = useOnboardingBoard();

  // Client book — dominating search + field-level advanced search.
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState(""); // only this drives results — set on Enter/search-icon click
  const [advOpen, setAdvOpen] = useState(false);
  const [advDraft, setAdvDraft] = useState<Record<string, string>>(emptyAdv());
  const [advActive, setAdvActive] = useState<Record<string, string>>(emptyAdv());
  const [draftFields, setDraftFields] = useState<string[]>([]);

  const activeAdvKeys = ADV_FIELDS.map((f) => f.key).filter((k) => norm(advActive[k] ?? ""));
  const hasAdv = activeAdvKeys.length > 0;
  const needle = norm(submittedQ);
  const submitSearch = () => setSubmittedQ(q);
  const clearSearch = () => { setQ(""); setSubmittedQ(""); };

  const filtered: ClientRow[] = useMemo(() => {
    if (!data) return [];
    if (!needle && !hasAdv) return [];
    return data.filter((c) => matchClient(c, needle) && matchAdv(c, advActive));
  }, [data, needle, advActive, hasAdv]);

  const applyAdv = () => {
    const next = emptyAdv();
    draftFields.forEach((k) => { if (norm(advDraft[k] ?? "").trim()) next[k] = advDraft[k]; });
    setAdvActive(next);
    setAdvOpen(false);
  };
  const resetAdv = () => { setAdvDraft(emptyAdv()); setAdvActive(emptyAdv()); setDraftFields([]); };
  const openAdv = () => {
    setAdvDraft({ ...advActive });
    setDraftFields(ADV_FIELDS.map((f) => f.key).filter((k) => norm(advActive[k] ?? "").trim()));
    setAdvOpen(true);
  };
  const addDraftField = (k: string) => { if (!draftFields.includes(k)) setDraftFields([...draftFields, k]); };
  const removeDraftField = (k: string) => {
    setDraftFields(draftFields.filter((x) => x !== k));
    setAdvDraft({ ...advDraft, [k]: "" });
  };
  const removeAdvChip = (k: string) => {
    setAdvActive((prev) => ({ ...prev, [k]: "" }));
    setAdvDraft((prev) => ({ ...prev, [k]: "" }));
    setDraftFields((prev) => prev.filter((x) => x !== k));
  };

  const openClient = (id: string) => router.push(`/rm/client-info/${id}`);
  const goSummary = (item: SummaryItem) => openClient(item.id);

  // Requests + Renewals — from mock data (lib/mock/rm-data.ts).
  const ticketsTotal = REQUEST_TICKETS.reduce((sum, i) => sum + i.n, 0);
  const renewalsOverdue = RENEWALS_DUE.filter((i) => i.t === "overdue").length;

  // Onboarding — real onboarding board (013 integration): every column except
  // "active" is still in the queue; a client only leaves once fully onboarded.
  const onboardingByUserId = useMemo(() => {
    const m = new Map<string, KycBoardClient>();
    (board ?? []).forEach((col) => col.clients.forEach((c) => m.set(c.userId, c)));
    return m;
  }, [board]);
  const onboardingQueue: SummaryItem[] = useMemo(() => (
    (board ?? [])
      .filter((col) => col.status !== "active")
      .flatMap((col) => col.clients.map((c): SummaryItem => (
        { id: c.userId, c: c.name, s: COLUMN_LABELS[col.status], t: ONBOARDING_TONE[col.status] }
      )))
  ), [board]);
  // "initial" (not yet submitted) counts as awaiting KYC too — every
  // non-active client is, by definition, still waiting on KYC clearance.
  const onboardingAwaitingKyc = onboardingQueue.length;

  return (
    <div className="relative -mx-16 -my-8 flex min-h-[calc(100vh_-_64px)] flex-col px-16 py-8">
      <div className="mx-auto flex w-full flex-1 flex-col">
        <div className="mb-4">
          <PageHeader
            title="Dashboard"
            subtitle={rmName ? `Hello, ${rmName} — here's your client book today.` : "Here's your client book today."}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
        {/* Client book */}
        <section className="flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[18px] font-semibold text-on-surface">Client Book</h3>
              <span className="text-[13px] text-secondary">{data?.length ?? 0} clients</span>
            </div>
            <Link href="/rm/onboarding-renewal">
              <Button icon={UserRoundPlus}>Onboard new</Button>
            </Link>
          </header>

          {/* Dominating client search */}
          <div className="border-outline-variant bg-surface-lowest px-5 py-4">
            <label
              htmlFor="cb-search"
              className="flex items-center gap-3 rounded-md border border-outline-variant bg-white px-[18px] py-3.5 shadow-card transition-all duration-150 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
            >
              <button
                type="button"
                onClick={submitSearch}
                title="Search"
                className="flex shrink-0 items-center justify-center text-primary/70"
              >
                <Search size={20} strokeWidth={2} />
              </button>
              <input
                id="cb-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                placeholder='E.g. "Ardent Capital"'
                className="min-w-0 flex-1 border-none bg-transparent text-[17px] font-medium text-on-surface outline-none placeholder:text-secondary/70"
              />
              {q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  title="Clear"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container text-secondary"
                >
                  <X size={15} strokeWidth={2.2} />
                </button>
              )}
            </label>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12.5px] text-secondary">
                {(needle || hasAdv) && (
                  <span>
                    <b className="font-semibold text-on-surface">{filtered.length}</b> match{filtered.length === 1 ? "" : "es"}
                    {needle ? <> for &ldquo;{submittedQ}&rdquo;</> : null}
                    {hasAdv ? (
                      <>
                        {" "}with <b className="font-semibold text-on-surface">{activeAdvKeys.length}</b> filter{activeAdvKeys.length === 1 ? "" : "s"}
                      </>
                    ) : null}
                  </span>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => (advOpen ? setAdvOpen(false) : openAdv())}
                  className={clsx(
                    "inline-flex items-center gap-1.5 text-[12.5px] font-semibold underline decoration-1 underline-offset-[3px]",
                    advOpen || hasAdv ? "text-primary" : "text-secondary",
                  )}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  Advanced Search{hasAdv ? <> · {activeAdvKeys.length}</> : null}
                </button>

                {advOpen && (
                  <>
                    <div onClick={() => setAdvOpen(false)} className="fixed inset-0 z-40" />
                    <div className="absolute right-0 top-[calc(100%+8px)] z-[41] w-[340px] rounded-md border border-outline-variant bg-white p-3.5 shadow-overlay">
                      <div className="mb-2.5 flex items-center justify-between">
                        <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-secondary">Advanced search</div>
                        <button
                          type="button"
                          onClick={() => setAdvOpen(false)}
                          title="Close"
                          className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-secondary"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>

                      {draftFields.length > 0 && (
                        <div className="mb-2.5 flex flex-col gap-2">
                          {draftFields.map((k) => {
                            const f = ADV_FIELDS.find((x) => x.key === k)!;
                            return (
                              <div key={k} className="grid grid-cols-[84px_1fr_auto] items-center gap-2">
                                <span className="text-[12px] font-semibold text-secondary">{f.label}</span>
                                <input
                                  autoFocus
                                  value={advDraft[k] ?? ""}
                                  onChange={(e) => setAdvDraft({ ...advDraft, [k]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") applyAdv(); }}
                                  placeholder={f.placeholder}
                                  className="min-w-0 rounded border border-outline-variant bg-surface-lowest px-2 py-1.5 text-[13px] text-on-surface outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeDraftField(k)}
                                  title={`Remove ${f.label}`}
                                  className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-secondary"
                                >
                                  <X size={13} strokeWidth={2} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {ADV_FIELDS.some((f) => !draftFields.includes(f.key)) && (
                        <div>
                          <div className="mb-1.5 text-[11px] text-secondary">{draftFields.length ? "Add another field" : "Filter by field"}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {ADV_FIELDS.filter((f) => !draftFields.includes(f.key)).map((f) => (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => addDraftField(f.key)}
                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-outline-variant px-2.5 py-1 text-[12px] font-medium text-secondary"
                              >
                                <span className="font-bold">+</span> {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3.5 flex items-center justify-end gap-3.5 border-t border-outline-variant pt-2.5">
                        <button type="button" onClick={resetAdv} className="text-[12.5px] font-semibold text-secondary">Reset</button>
                        <button
                          type="button"
                          onClick={applyAdv}
                          disabled={draftFields.length === 0}
                          className={clsx(
                            "rounded-full border border-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white",
                            draftFields.length === 0 ? "cursor-not-allowed bg-primary/50" : "cursor-pointer bg-primary",
                          )}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {hasAdv && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {activeAdvKeys.map((k) => {
                  const f = ADV_FIELDS.find((x) => x.key === k)!;
                  return (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1 text-[12px] font-medium text-on-surface"
                    >
                      <span className="font-semibold text-secondary">{f.label}:</span>
                      <span>{advActive[k]}</span>
                      <button
                        type="button"
                        onClick={() => removeAdvChip(k)}
                        title={`Remove ${f.label} filter`}
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary/20 text-primary"
                      >
                        <X size={12} strokeWidth={2.4} />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={resetAdv}
                  className="rounded px-1.5 py-1 text-[12px] font-semibold text-secondary underline underline-offset-[3px]"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Loading state */}
          {loading && !data && (
            <div className="px-5 py-10 text-center text-[13px] text-secondary">Loading…</div>
          )}

          {/* Error state — rendered above the empty-state block */}
          {error && (
            <div className="px-5 py-3 text-[13px] font-medium text-error">{error}</div>
          )}

          {/* Table */}
          <table className="w-full border-collapse text-[14px]">
            {filtered.length > 0 && (
              <thead>
                <tr>
                  {["Client Name", "Phone Number", "Status", "Assigned RM", "Renewal Date"].map((h) => (
                    <th key={h} className="bg-surface-low px-[18px] py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
                      {h}
                    </th>
                  ))}
                  <th className="w-11 bg-surface-low" />
                </tr>
              </thead>
            )}
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-outline-variant bg-surface-lowest">
                    {!needle && !hasAdv ? (
                      <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-container text-secondary">
                          <Search size={20} strokeWidth={1.75} />
                        </span>
                        <div className="text-[15px] font-semibold text-on-surface">Look up a client to get started</div>
                        <div className="max-w-[440px] text-[13px] leading-normal text-secondary">
                          Enter a client name, phone number, email, or client ID in the search bar above to pull up their record.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-container text-secondary">
                          <SearchX size={20} strokeWidth={1.75} />
                        </span>
                        <div className="text-[15px] font-semibold text-on-surface">No matching client{needle ? <> for &ldquo;{submittedQ}&rdquo;</> : null}</div>
                        <div className="max-w-[440px] text-[13px] leading-normal text-secondary">
                          Double-check the spelling, try fewer characters, or search another field — name, phone number, email, or client ID.
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const mockOverlay = getMockOverlay(r.id);
                  const ob = onboardingByUserId.get(r.id);
                  const overlay = ob
                    ? { ...mockOverlay, status: COLUMN_LABELS[ob.status], tone: ONBOARDING_TONE[ob.status] }
                    : mockOverlay;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openClient(r.id)}
                      className="group cursor-pointer transition-colors duration-100 hover:bg-surface-container"
                    >
                      <td className="border-t border-outline-variant px-[18px] py-[13px] font-semibold text-on-surface">{r.name}</td>
                      <td className="border-t border-outline-variant px-[18px] py-[13px] tabular-nums text-secondary">{r.phone || "—"}</td>
                      <td className="border-t border-outline-variant px-[18px] py-[13px]"><Chip tone={overlay.tone}>{overlay.status}</Chip></td>
                      <td className="border-t border-outline-variant px-[18px] py-[13px] text-secondary">{r.assignedRm || "Unassigned"}</td>
                      <td
                        className={clsx(
                          "border-t border-outline-variant px-[18px] py-[13px]",
                          overlay.renewal === "Overdue" ? "font-semibold text-error" : "text-secondary",
                        )}
                      >
                        {overlay.renewal.replace(", 2026", "")}
                      </td>
                      <td className="border-t border-outline-variant px-3.5 py-[13px] text-right text-secondary group-hover:text-primary">
                        <ChevronRight size={16} strokeWidth={2} className="ml-auto" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination — only once a search actually returns rows */}
          {(needle || hasAdv) && filtered.length > 0 && (
            <Pagination from={1} to={filtered.length} total={filtered.length} />
          )}
        </section>

        {/* Right rail — accordion, one card open at a time, fills book height */}
        <RailAccordion
          cards={[
            {
              icon: Inbox,
              label: "Requests Tickets",
              value: String(ticketsTotal),
              sub: "across 3 types",
              mode: "count",
              items: REQUEST_TICKETS,
              footerLabel: "Review requests",
              onFooter: () => {},
            },
            {
              icon: CalendarClock,
              label: "Renewals Due",
              value: String(RENEWALS_DUE.length),
              sub: `${renewalsOverdue} overdue`,
              subTone: "down",
              items: RENEWALS_DUE,
              onItem: goSummary,
              footerLabel: "View all renewals",
              onFooter: () => router.push("/rm/onboarding-renewal"),
            },
            {
              icon: UserRoundPlus,
              label: "Onboarding",
              value: String(onboardingQueue.length),
              sub: `${onboardingAwaitingKyc} awaiting KYC`,
              items: onboardingQueue,
              onItem: goSummary,
              footerLabel: "Go to onboarding",
              onFooter: () => router.push("/rm/onboarding-renewal"),
            },
          ]}
        />
        </div>
      </div>
    </div>
  );
}

function Pagination({ from, to, total }: { from: number; to: number; total: number }) {
  const Btn = ({ children, on, disabled }: { children: React.ReactNode; on?: boolean; disabled?: boolean }) => (
    <span
      className={clsx(
        "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-md border px-2 text-[13px] font-semibold",
        on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white",
        !on && (disabled ? "text-outline-variant" : "text-secondary"),
      )}
    >
      {children}
    </span>
  );
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant px-[18px] py-3.5">
      <span className="text-[13px] text-secondary">
        Showing <b className="text-on-surface">{from}–{to}</b> of {total} clients
      </span>
      {/* <div className="flex items-center gap-1.5">
        <Btn disabled>‹ Prev</Btn>
        <Btn on>1</Btn>
        <Btn>2</Btn>
        <Btn>3</Btn>
        <span className="px-0.5 text-secondary">…</span>
        <Btn>18</Btn>
        <Btn>Next ›</Btn>
      </div> */}
    </div>
  );
}
