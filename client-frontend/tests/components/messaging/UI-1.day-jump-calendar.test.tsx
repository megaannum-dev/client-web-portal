// 021 UI-1 — DayJumpCalendar: only recorded days are pickable, the selected
// day fills primary, unselected-recorded days carry a dot, month nav works.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CHAT_DAYS } from "./fixtures/chat-days";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { DayJumpCalendar } from "@/components/messaging/DayJumpCalendar";

const recorded = new Set(CHAT_DAYS.map((d) => d.iso)); // 2026-07-18, 2026-08-11, 2026-08-28, 2026-09-01, 2026-09-02

// Walks the calendar's own view state from whatever the real current month
// is to August 2026 (year/month fixed to the fixture, month is 0-indexed).
function navigateToAug2026() {
  const target = new Date(2026, 7, 1);
  const now = new Date();
  const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  const btn = screen.getByLabelText(diff >= 0 ? "messaging.calendar.next_month" : "messaging.calendar.prev_month");
  for (let i = 0; i < Math.abs(diff); i++) fireEvent.click(btn);
}

describe("UI-1 DayJumpCalendar", () => {
  it("the default view is the current month, and today (unrecorded) is disabled", () => {
    render(<DayJumpCalendar recordedIsos={recorded} selectedIso={null} onPick={vi.fn()} />);
    const today = new Date();
    const cell = screen.getByText(String(today.getDate())).closest("button")!;
    expect(cell.disabled).toBe(true);
    expect(cell.className).toContain("opacity-45");
    expect(cell.querySelector("span.absolute")).toBeFalsy(); // no dot — never recorded
  });

  it("navigating to Aug 2026 shows the 11th and 28th as enabled with a dot, the 12th disabled", () => {
    render(<DayJumpCalendar recordedIsos={recorded} selectedIso={null} onPick={vi.fn()} />);
    navigateToAug2026();

    const day11 = screen.getByText("11").closest("button")!;
    expect(day11.disabled).toBe(false);
    expect(day11.querySelector(".bg-primary")).toBeTruthy(); // the dot

    const day28 = screen.getByText("28").closest("button")!;
    expect(day28.disabled).toBe(false);

    const day12 = screen.getByText("12").closest("button")!;
    expect(day12.disabled).toBe(true);
    expect(day12.className).toContain("opacity-45");
  });

  it("the selected day fills primary and drops its dot", () => {
    render(<DayJumpCalendar recordedIsos={recorded} selectedIso="2026-08-11" onPick={vi.fn()} />);
    navigateToAug2026();

    const day11 = screen.getByText("11").closest("button")!;
    expect(day11.className).toContain("bg-primary");
    expect(day11.className).toContain("text-primary-foreground");
    expect(day11.querySelector("span.absolute")).toBeFalsy(); // no dot once selected
  });

  it("clicking an enabled day calls onPick with its ISO date", () => {
    const onPick = vi.fn();
    render(<DayJumpCalendar recordedIsos={recorded} selectedIso={null} onPick={onPick} />);
    navigateToAug2026();

    fireEvent.click(screen.getByText("11").closest("button")!);
    expect(onPick).toHaveBeenCalledWith("2026-08-11");
  });

  it("shows the days-with-messages legend", () => {
    render(<DayJumpCalendar recordedIsos={recorded} selectedIso={null} onPick={vi.fn()} />);
    expect(screen.getByText("messaging.calendar.days_with_messages")).toBeInTheDocument();
  });
});
