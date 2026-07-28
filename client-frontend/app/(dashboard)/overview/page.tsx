"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
} from "@/lib/icons";
import type { ActionLevel } from "@/types/portal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard }   from "@/components/ui/StatCard";
import { EyeToggle }  from "@/components/ui/EyeToggle";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { useClientEvents } from "@/lib/hooks/useOnboardingEvents";
import { useRequests } from "@/lib/hooks/useRequests";
import type { TicketStatus, TicketKind } from "@/lib/api/requests";

const STATUS_BADGE: Record<TicketStatus, string> = {
  new:         "badge-caution",
  in_progress: "badge-caution",
  replied:     "badge-caution",
  closed:      "badge-success",
  declined:    "badge-warning",
};

const REQUEST_TYPE_I18N_KEY: Record<TicketKind, string> = {
  allotment:  "request_type.allotment",
  redemption: "request_type.redemption",
  other:      "request_type.others",
};

function formatRequestDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }); }

// Icons used within the on-primary Latest Events panel only.
const PANEL_ICONS = {
  urgent:  ShieldAlert,
  caution: ClipboardCheck,
  info:    CheckCircle2,
  primary: TrendingUp,
  neutral: AlertCircle,
} satisfies Record<ActionLevel, unknown>;

// ── Hero Banner ────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    key:   "wealth_management",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1440&q=80",
  },
  {
    key:   "precision_data",
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1440&q=80",
  },
  {
    key:   "institutional_planning",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1440&q=80",
  },
  {
    key:   "expert_guidance",
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1440&q=80",
  },
  {
    key:   "sustainable_growth",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1440&q=80",
  },
] as const;

function HeroBanner() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const trackRef    = useRef<HTMLDivElement>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const hoveredRef  = useRef(false);

  const scrollTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    setActive(index);
  };

  const startTimer = () => {
    if (hoveredRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % SLIDES.length;
        const track = trackRef.current;
        if (track) track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
        return next;
      });
    }, 5000);
  };

  const pauseTimer = () => {
    hoveredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resumeTimer = () => {
    hoveredRef.current = false;
    startTimer();
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDotClick = (index: number) => { scrollTo(index); startTimer(); };
  const handlePrev = () => { scrollTo((active - 1 + SLIDES.length) % SLIDES.length); startTimer(); };
  const handleNext = () => { scrollTo((active + 1) % SLIDES.length); startTimer(); };

  return (
    <div
      className="group relative rounded-lg overflow-hidden shadow-card"
      style={{ height: 340 }}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <div
        ref={trackRef}
        className="flex h-full overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className="relative flex-shrink-0 w-full h-full snap-start"
            style={{
              backgroundImage:    `url(${slide.image})`,
              backgroundSize:     "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-5 left-5 max-w-xs backdrop-blur-md bg-black/25 border border-white/20 rounded-lg p-4">
              <p className="text-white font-semibold text-base leading-snug mb-3">{t(`overview.slides.${slide.key}.title`)}</p>
              <button
                type="button"
                className="inline-flex items-center px-4 py-1.5 rounded bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {t(`overview.slides.${slide.key}.cta`)}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Left nav */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/55"
      >
        <ChevronLeft size={18} strokeWidth={2} />
      </button>

      {/* Right nav */}
      <button
        type="button"
        onClick={handleNext}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/55"
      >
        <ChevronRight size={18} strokeWidth={2} />
      </button>

      <div className="absolute bottom-5 right-5 flex items-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleDotClick(i)}
            aria-label={`Go to slide ${i + 1}`}
            className="w-2 h-2 rounded-full transition-opacity"
            style={{ backgroundColor: "white", opacity: i === active ? 1 : 0.4 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${STATUS_BADGE[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function SectionHeader({ title, linkLabel, linkHref }: { title: string; linkLabel: string; linkHref: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
      <Link
        href={linkHref}
        className="flex items-center gap-0.5 text-label-md font-semibold uppercase tracking-[0.05em] text-primary hover:opacity-80 transition-opacity"
      >
        {linkLabel}
        <ChevronRight size={13} strokeWidth={2.5} />
      </Link>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { t } = useTranslation();
  // ponytail: default unmasked (was `true`/masked pre-FE-10) — these two cards
  // now render on first paint with no interaction; upgrade to masked-by-default
  // once there's a product call on it, toggle still works either way.
  const [censored, setCensored] = useState(false);
  const { data: portfolio } = usePortfolio();
  const latestEvents = useClientEvents().slice(0, 3);
  const recentRequests = useRequests().data.slice(0, 3);
  const changePct = portfolio?.change_pct ?? null;
  const mask = (v: string) => (censored ? "********" : v);

  return (
    <div className="flex flex-col gap-8 pb-20">

      <PageHeader
        title={t("overview.title")}
        subtitle={t("overview.subtitle")}
      />

      {/* ── Hero Banner ───────────────────────────────────────────────────── */}
      <HeroBanner />

      {/* ── Main section: left 2/3 + right 1/3 ──────────────────────────── */}
      <div className="grid grid-cols-[2.5fr_minmax(300px,1fr)] gap-6 items-stretch">

        {/* LEFT ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-8">

          {/* Account Summary */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-headline-md font-semibold text-on-surface">{t("overview.account_summary")}</h2>
              <EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label={t("overview.total_portfolio_value")}
                value={portfolio ? mask(`$${portfolio.total_value.toFixed(2)}`) : "—"}
              />
              <StatCard
                label={t("overview.amount_in_trade", { defaultValue: "Amount in Trade" })}
                value={portfolio ? mask(`$${portfolio.amount_in_trade.toFixed(2)}`) : "—"}
                sub={
                  <span className="text-body-sm text-secondary">
                    {changePct !== null
                      ? `${changePct >= 0 ? "+" : ""}${(changePct * 100).toFixed(2)}% ${t("common.vs_last_month")}`
                      : "—"}
                  </span>
                }
              />
            </div>
          </div>

          {/* Recent Request Status */}
          <div>
            <SectionHeader title={t("overview.recent_request_status")} linkLabel={t("overview.view_all_requests")} linkHref="/portfolio" />
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full table-fixed">
                <thead className="bg-surface-container">
                  <tr>
                    {[
                      t("overview.columns.request_type"),
                      t("overview.columns.model_fund"),
                      t("overview.columns.submitted"),
                      t("overview.columns.status"),
                      t("overview.columns.amount"),
                    ].map((h) => (
                      <th key={h} className="text-left text-label-md font-semibold uppercase tracking-[0.05em] text-secondary px-5 py-3 w-1/5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                  {recentRequests.map((r) => (
                    <tr key={r.ref}>
                      <td className="px-5 py-4 text-body-sm text-on-surface">{t(REQUEST_TYPE_I18N_KEY[r.kind])}</td>
                      <td className="px-5 py-4 text-body-sm text-on-surface">{r.model_name ?? r.subject}</td>
                      <td className="px-5 py-4 text-body-sm text-secondary">{formatRequestDate(r.created_at)}</td>
                      <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-4 text-body-sm font-semibold text-on-surface">{r.amount != null ? `$${r.amount.toLocaleString("en-US")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT ────────────────────────────────────────────────────────── */}
        <div className="bg-primary rounded-xl p-6 flex flex-col gap-4">
          <div className="pb-2 border-b border-white/20">
            <h2 className="text-2xl font-bold text-white leading-8">{t("overview.latest_events")}</h2>
          </div>
          <div className="flex flex-col gap-4">
            {latestEvents.map((event) => {
              const EventIcon = PANEL_ICONS[event.level];
              const isUrgent   = event.level === "urgent";
              const isVerified = event.level === "info";
              const cardBg     = isUrgent ? "bg-[#E95844]/85" : "bg-white/10";
              const cardBorder = isUrgent ? "border-white/40" : "border-white/25";
              const iconBg     = isVerified ? "bg-[#c4e84db2]" : "bg-white/20";

              const cls = `flex items-start gap-4 p-4 rounded-md border shadow-sm ${cardBg} ${cardBorder}`;
              return (
                <div key={event.id} className={cls}>
                  <div className={`shrink-0 w-10 h-10 rounded-md flex items-center justify-center ${iconBg}`}>
                    <EventIcon size={18} strokeWidth={1.75} className="text-white" />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-base font-bold text-white leading-6">{t(`mock.latest_events.${event.id}.title`, { defaultValue: event.title })}</p>
                    <p className="text-sm text-white/90 leading-5">{t(`mock.latest_events.${event.id}.description`, { defaultValue: event.description })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>


    </div>
  );
}
