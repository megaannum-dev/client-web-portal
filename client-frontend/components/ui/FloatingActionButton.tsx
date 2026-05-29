"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Plus, Ticket, Download, HelpCircle } from "@/lib/icons";
import { RaiseTicketModal } from "@/components/ui/RaiseTicketModal";
import { downloadAs } from "@/lib/downloadFile";
import { MOCK_EOM_REPORTS } from "@/lib/mock/data";
import type { AllotmentRequest } from "@/lib/mock/data";

type ActionId = "ticket" | "download" | "faq";

const SPEED_DIAL_ACTIONS: {
  id: ActionId;
  Icon: LucideIcon;
  labelKey: string;
}[] = [
  { id: "faq",      Icon: HelpCircle, labelKey: "fab.common_query_faq"     },
  { id: "download", Icon: Download,   labelKey: "fab.download_latest_eom"  },
  { id: "ticket",   Icon: Ticket,     labelKey: "fab.raise_ticket"         },
];

export function FloatingActionButton() {
  const [expanded, setExpanded]     = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const { t } = useTranslation();

  function handleAction(id: ActionId) {
    if (id === "ticket") {
      setTicketOpen(true);
      setExpanded(false);
    } else if (id === "download") {
      downloadAs("/dummy-EoM-Report.pdf", MOCK_EOM_REPORTS[0].name);
      setExpanded(false);
    }
    // faq: no-op until implemented
  }

  function handleConfirm(_req: AllotmentRequest) {
    setTicketOpen(false);
  }

  return (
    <>
      {/* Click-away backdrop */}
      {expanded && (
        <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
      )}

      <div className="fixed bottom-8 right-8 z-50">
        {/*
          Single pill wrapper — starts as a circle (FAB only) and expands upward
          to encapsulate sub-actions. overflow-hidden clips the growing content.
        */}
        <div
          className={[
            "flex flex-col items-center rounded-full px-[10px]",
            "transition-[background-color,box-shadow] duration-350 ease-in-out",
            expanded
              ? "bg-surface-lowest shadow-overlay"
              : "bg-transparent shadow-none",
          ].join(" ")}
        >

          {/* Sub-actions — grid-rows trick: 0fr → 1fr drives the pull-up */}
          <div
            className={[
              "grid w-full",
              "[transition:grid-template-rows_350ms_cubic-bezier(0.4,0,0.2,1)]",
              expanded ? "[grid-template-rows:1fr]" : "[grid-template-rows:0fr]",
            ].join(" ")}
          >
            {/*
              min-h-0 is required for the grid-rows collapse trick.
              clip-path instead of overflow-hidden: clips content vertically at the box edge
              (hiding collapsed items) while extending the clip region 9999px on both sides
              so that absolute-positioned tooltips bleeding left of the pill are NOT clipped.
            */}
            <div className="min-h-0 [clip-path:inset(0_-9999px_0_-9999px)]">
              <div className="flex flex-col items-center gap-2 pt-3 pb-2">
                {SPEED_DIAL_ACTIONS.map(({ id, Icon, labelKey }, i) => (
                  <div
                    key={id}
                    className="group relative flex items-center justify-center w-full"
                  >
                    {/* Tooltip label — slides in from the right on hover */}
                    <span
                      className={[
                        "absolute right-[52px] whitespace-nowrap",
                        "px-2.5 py-1 rounded-md text-label-md font-semibold",
                        "bg-surface-high text-on-surface shadow-card",
                        "pointer-events-none select-none",
                        "opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0",
                        "transition-[opacity,transform] duration-150",
                        expanded ? "" : "hidden",
                      ].join(" ")}
                    >
                      {t(labelKey)}
                    </span>

                    <button
                      type="button"
                      aria-label={t(labelKey)}
                      onClick={() => handleAction(id)}
                      style={{
                        // Stagger: buttons closest to FAB (last in list) appear first on expand,
                        // disappear last on collapse — giving a "pull up from FAB" feel.
                        transitionDelay: expanded
                          ? `${(SPEED_DIAL_ACTIONS.length - 1 - i) * 45}ms`
                          : `${i * 30}ms`,
                      }}
                      className={[
                        "size-11 rounded-full flex items-center justify-center shrink-0",
                        "bg-primary text-white hover:opacity-90 active:scale-95 cursor-pointer",
                        "transition-all duration-200",
                        expanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
                      ].join(" ")}
                    >
                      <Icon size={20} strokeWidth={1.75} />
                      <span className="sr-only">{t(labelKey)}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main FAB — always visible at the bottom of the pill */}
          <div className="py-[10px]">
            <button
              type="button"
              aria-label={expanded ? t("fab.close_quick_actions") : t("fab.quick_actions")}
              onClick={() => setExpanded((v) => !v)}
              className="size-14 rounded-full flex items-center justify-center bg-primary text-white shadow-overlay cursor-pointer hover:opacity-90 active:scale-95 transition-all duration-200"
            >
              <Plus
                size={24}
                strokeWidth={2}
                className={`transition-transform duration-300 ${expanded ? "rotate-45" : "rotate-0"}`}
              />
            </button>
          </div>
        </div>
      </div>

      {ticketOpen && (
        <RaiseTicketModal
          onClose={() => setTicketOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
