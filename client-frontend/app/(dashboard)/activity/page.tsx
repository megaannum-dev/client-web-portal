"use client";

import { useState } from "react";
import {
  TrendingUp,
  AlarmClock,
  FileText,
  BarChart2,
  Shield,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "All Types" | "Market News" | "Account Reminders";
type ActionVariant = "filled" | "outline";

interface ActivityItem {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  time: string;
  description: string;
  category: "Market News" | "Account Reminders";
  primaryLabel: string;
  primaryVariant: ActionVariant;
  secondaryLabel: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const ACTIVITY: ActivityItem[] = [
  {
    icon: TrendingUp,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Fed Interest Rate Decision Released",
    time: "2 hours ago",
    description:
      "The Federal Reserve has announced its latest interest rate decision, impacting market volatility and portfolio yields. Historical news and reminders relevant to the client are now updated in your dashboard.",
    category: "Market News",
    primaryLabel: "Read Full Report",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  },
  {
    icon: AlarmClock,
    iconBg: "bg-warning-container",
    iconColor: "text-warning",
    title: "KYC Upload Reminder",
    time: "5 hours ago",
    description:
      "Your annual renewal for KYC document is due in next 10 days. Please ensure recent compliance documents are uploaded to avoid processing delays.",
    category: "Account Reminders",
    primaryLabel: "Go Upload",
    primaryVariant: "filled",
    secondaryLabel: "Mark as Read",
  },
  {
    icon: FileText,
    iconBg: "bg-surface-container",
    iconColor: "text-secondary",
    title: "New Compliance Policy Update",
    time: "Yesterday",
    description:
      "We have updated our institutional AML declaration protocols to align with new regional regulations. Review the changes to ensure your account remains compliant.",
    category: "Account Reminders",
    primaryLabel: "Review Policy",
    primaryVariant: "outline",
    secondaryLabel: "Dismiss",
  },
  {
    icon: BarChart2,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Market Insight: Tech Sector Rebound",
    time: "Oct 18, 2023",
    description:
      "Our analysts have released a new brief on the projected growth of the technology sector following the latest earnings reports from major providers.",
    category: "Market News",
    primaryLabel: "View Insight",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  },
  {
    icon: Shield,
    iconBg: "bg-surface-container",
    iconColor: "text-secondary",
    title: "Security Alert: New Login Detected",
    time: "Oct 17, 2023",
    description:
      "A new login was detected from a Chrome browser on macOS. If this was not you, please secure your account immediately by changing your password.",
    category: "Account Reminders",
    primaryLabel: "Manage Devices",
    primaryVariant: "outline",
    secondaryLabel: "I recognize this",
  },
];

const FILTERS: Category[] = ["All Types", "Market News", "Account Reminders"];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = useState<Category>("All Types");

  const items =
    activeFilter === "All Types"
      ? ACTIVITY
      : ACTIVITY.filter((a) => a.category === activeFilter);

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title="Activity"
        subtitle="Stay updated with the latest market news and account reminders."
      />

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActiveFilter(f)}
            className={[
              "px-5 py-2 rounded-full text-body-sm font-bold transition-colors duration-150",
              activeFilter === f
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container text-secondary hover:bg-surface-high",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Activity stream */}
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="bg-surface-lowest border border-outline-variant rounded-xl p-5 flex gap-5 items-start shadow-card hover:shadow-overlay transition-shadow duration-150"
            >
              <div
                className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg} ${item.iconColor}`}
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
                    className={[
                      "text-body-sm font-bold px-4 py-1.5 rounded transition-colors duration-150",
                      item.primaryVariant === "filled"
                        ? "bg-primary text-white hover:opacity-90 shadow-sm"
                        : "text-primary border border-primary/20 hover:bg-primary/5",
                    ].join(" ")}
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
