"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { ChevronDown } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import type { SummaryItem, CountItem } from "@/lib/mock/rm-data";

/* ---- SummaryCard -------------------------------------------- */
interface SummaryCardBaseProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  subTone?: "down" | "neutral";
  footerLabel?: string;
  onFooter?: () => void;
  /** Whether this card is expanded (accordion-controlled). Defaults true. */
  open?: boolean;
  /** If provided, the header becomes a toggle button showing a chevron. */
  onToggle?: () => void;
}

interface LinkModeProps extends SummaryCardBaseProps {
  mode?: "link";
  items: SummaryItem[];
  onItem?: (item: SummaryItem) => void;
}

interface CountModeProps extends SummaryCardBaseProps {
  mode: "count";
  items: CountItem[];
  onItem?: never;
}

export type SummaryCardProps = LinkModeProps | CountModeProps;

export function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  subTone = "neutral",
  items,
  onItem,
  footerLabel,
  onFooter,
  mode = "link",
  open = true,
  onToggle,
}: SummaryCardProps) {
  const isAccordion = !!onToggle;

  return (
    <section
      className="rounded-2xl border border-outline-variant bg-surface-lowest shadow-card flex flex-col overflow-hidden"
      style={{
        // flex-basis stays 'auto' (= natural header height) in both states so
        // CSS only needs to interpolate the numeric flex-grow, which it can do.
        flexGrow: open ? 1 : 0,
        flexShrink: 0,
        flexBasis: "auto",
        minHeight: 0,
        transition: "flex-grow 0.25s ease",
      }}
    >
      {/* Header — always visible; acts as the accordion toggle */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!isAccordion}
        className={clsx(
          "w-full shrink-0 px-5 pb-3 pt-3.5 text-left",
          isAccordion ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-secondary">
            {label}
          </span>
          <span className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded text-primary"
              style={{ background: "rgba(242,116,5,0.10)" }}
            >
              <Icon size={16} strokeWidth={1.75} />
            </span>
            {isAccordion && (
              <span
                className="text-secondary transition-transform duration-200"
                style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
              >
                <ChevronDown size={15} strokeWidth={2} />
              </span>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[30px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
            {value}
          </span>
          <span
            className={clsx(
              "text-[12px] font-semibold",
              subTone === "down" ? "text-error" : "text-secondary",
            )}
          >
            {sub}
          </span>
        </div>
      </button>

      {/*
        Body — ALWAYS MOUNTED, never conditionally removed.
        The grid-template-rows trick animates height from 0 to auto without
        needing to know the content's pixel height in advance. The inner div
        must have overflow:hidden so the row truly collapses to 0fr.
      */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease",
        }}
      >
        <div
          className="flex flex-col"
          style={{ overflow: "hidden", minHeight: 0 }}
        >
          {/* Row list — no dividers, cozy padding */}
          <div className="flex flex-col">
            {mode === "count"
              ? (items as CountItem[]).map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between gap-2.5 px-5 py-2"
                  >
                    <span className="flex items-center gap-[9px] text-[13px] font-semibold text-on-surface">
                      <span
                        className="h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{
                          // CSS vars here are raw "R G B" channels — must wrap in rgb()
                          background:
                            x.t === "muted"
                              ? "rgb(var(--color-secondary))"
                              : "rgb(var(--color-primary))",
                        }}
                      />
                      {x.c}
                    </span>
                    <span className="text-[14px] font-bold tabular-nums text-on-surface">
                      {x.n}
                    </span>
                  </div>
                ))
              : (items as SummaryItem[]).map((x, i) => (
                  <button
                    key={x.id + i}
                    type="button"
                    onClick={() =>
                      (onItem as ((item: SummaryItem) => void) | undefined)?.(x)
                    }
                    className={clsx(
                      "flex items-center justify-between gap-2.5 px-5 py-2 text-left transition-colors duration-150",
                      onItem
                        ? "cursor-pointer hover:bg-surface-container"
                        : "cursor-default",
                    )}
                  >
                    <span className="text-[13px] font-semibold text-on-surface">
                      {x.c}
                    </span>
                    <Chip tone={x.t} dot={x.t === "neutral"}>
                      {x.d || x.s}
                    </Chip>
                  </button>
                ))}
          </div>

          {/* Footer — pinned to the bottom of the open card */}
          {footerLabel && (
            <button
              type="button"
              onClick={onFooter}
              className="mt-auto block w-full border-t border-outline-variant px-5 py-2.5 text-left text-[13px] font-bold text-primary"
            >
              {footerLabel} →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---- RailAccordion ------------------------------------------ */
// Exactly one card is open at a time; the open card flexes to fill
// the rail's height so it always matches the client book.

interface RailCard extends Omit<SummaryCardProps, "open" | "onToggle"> {}

interface RailAccordionProps {
  cards: RailCard[];
  defaultOpen?: number;
}

export function RailAccordion({ cards, defaultOpen = 0 }: RailAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-1 flex-col gap-2.5 min-h-0">
      {cards.map((card, i) => (
        <SummaryCard
          key={i}
          {...(card as SummaryCardProps)}
          open={open === i}
          onToggle={() => setOpen(i)}
        />
      ))}
    </div>
  );
}
