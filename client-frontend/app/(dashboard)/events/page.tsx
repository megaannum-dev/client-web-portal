"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  AlarmClock,
  FileText,
  BarChart2,
  Shield,
  Briefcase,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useEventItems } from "@/lib/hooks/useEventItems";
import { LEVEL_CONFIG } from "@/lib/levelConfig";
import {
  MOCK_EVENT_ITEMS,
  type EventIconType,
  type EventCategory,
  type ActionVariant,
} from "@/lib/mock/data";

// ── Constants ─────────────────────────────────────────────────────────────────

type FilterCategory = "All Types" | EventCategory;

const FILTERS: FilterCategory[] = ["All Types", "Market News", "Account Notification", "Requests Status", "Others"];

// Maps each filter/category value to its translation key.
const FILTER_KEYS: Record<FilterCategory, string> = {
  "All Types":            "events.filters.all_types",
  "Market News":          "events.filters.market_news",
  "Account Notification": "events.filters.account_notification",
  "Requests Status":      "events.filters.requests_status",
  "Others":               "events.filters.others",
};

const ICON_MAP: Record<EventIconType, LucideIcon> = {
  "trending-up": TrendingUp,
  "alarm-clock": AlarmClock,
  "file-text":   FileText,
  "bar-chart":   BarChart2,
  "shield":      Shield,
  "briefcase":   Briefcase,
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("All Types");
  const dynamicItems = useEventItems();

  const allItems = [...dynamicItems, ...MOCK_EVENT_ITEMS].map((d) => ({
    id:             d.id,
    icon:           ICON_MAP[d.iconType] ?? Briefcase,
    iconCls:        (LEVEL_CONFIG[d.level] ?? LEVEL_CONFIG.neutral).icon,
    title:          t(`mock.event_items.${d.id}.title`,       { defaultValue: d.title }),
    time:           t(`mock.event_items.${d.id}.time`,        { defaultValue: d.time }),
    description:    t(`mock.event_items.${d.id}.description`, { defaultValue: d.description }),
    category:       d.category as EventCategory,
    primaryLabel:   t(`mock.event_items.${d.id}.primary`,     { defaultValue: d.primaryLabel }),
    primaryVariant: d.primaryVariant as ActionVariant,
    secondaryLabel: t(`mock.event_items.${d.id}.secondary`,   { defaultValue: d.secondaryLabel }),
  }));

  const items =
    activeFilter === "All Types"
      ? allItems
      : allItems.filter((a) => a.category === activeFilter);

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("events.title")}
        subtitle={t("events.subtitle")}
      />

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActiveFilter(f)}
            className={clsx(
              "px-5 py-2 rounded-full text-body-sm font-bold transition-colors duration-150",
              activeFilter === f
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container text-secondary hover:bg-surface-high",
            )}
          >
            {t(FILTER_KEYS[f])}
          </button>
        ))}
      </div>

      {/* Event stream */}
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="bg-surface-lowest border border-outline-variant rounded-xl p-5 flex gap-5 items-start shadow-card hover:shadow-overlay transition-shadow duration-150"
            >
              <div
                className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${item.iconCls}`}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4 mb-1">
                  <h3 className="text-headline-md font-bold text-on-surface">{item.title}</h3>
                  <span className="text-label-md text-secondary shrink-0">{item.time}</span>
                </div>
                <p className="text-body-sm text-secondary leading-relaxed mb-4">
                  {item.description}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={clsx(
                      "text-body-sm font-bold px-4 py-1.5 rounded transition-colors duration-150",
                      item.primaryVariant === "filled"
                        ? "bg-primary text-white hover:opacity-90 shadow-sm"
                        : "text-primary border border-primary/20 hover:bg-primary/5",
                    )}
                  >
                    {item.primaryLabel}
                  </button>
                  <button
                    type="button"
                    className="text-body-sm font-medium text-secondary px-3 py-1.5 rounded hover:bg-surface-container transition-colors duration-150"
                  >
                    {item.secondaryLabel}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
