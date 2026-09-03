// 021 UI-3 — DayJumpCalendar: enabled/disabled/selected cell states and the
// "Days with messages" dot, using a fixed `today` so future-day disabling
// is deterministic.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DayJumpCalendar } from "@/components/rm/chat/DayJumpCalendar";

const TODAY = new Date(2026, 7, 15); // 15 Aug 2026 (month is 0-indexed)
const MESSAGE_DATES = new Set(["2026-08-11", "2026-08-28"]);

describe("positive", () => {
  it("a day with messages, not selected, is enabled and shows a dot", () => {
    render(
      <DayJumpCalendar messageDates={MESSAGE_DATES} selectedIso={null} today={TODAY} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    const cell = screen.getByRole("button", { name: "11" });
    expect(cell).not.toBeDisabled();
    expect(cell.querySelector("span.bg-primary")).toBeInTheDocument();
  });

  it("the selected day fills primary and shows no dot", () => {
    render(
      <DayJumpCalendar
        messageDates={MESSAGE_DATES} selectedIso="2026-08-11" today={TODAY} onPick={vi.fn()} onClose={vi.fn()}
      />,
    );
    const cell = screen.getByRole("button", { name: "11" });
    expect(cell.className).toContain("bg-primary");
    expect(cell.querySelector("span.bg-primary")).not.toBeInTheDocument();
  });

  it("clicking an enabled day calls onPick with its iso", () => {
    const onPick = vi.fn();
    render(
      <DayJumpCalendar messageDates={MESSAGE_DATES} selectedIso={null} today={TODAY} onPick={onPick} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "11" }));
    expect(onPick).toHaveBeenCalledWith("2026-08-11");
  });
});

describe("negative — disabled cells never fire onPick", () => {
  it("a day with no messages is disabled even though it is in the past", () => {
    render(
      <DayJumpCalendar messageDates={MESSAGE_DATES} selectedIso={null} today={TODAY} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    const cell = screen.getByRole("button", { name: "5" });
    expect(cell).toBeDisabled();
    expect(cell.className).toContain("opacity-45");
  });

  it("a future day (even one that hypothetically has messages) is disabled", () => {
    const future = new Set(["2026-08-20"]);
    const onPick = vi.fn();
    render(
      <DayJumpCalendar messageDates={future} selectedIso={null} today={TODAY} onPick={onPick} onClose={vi.fn()} />,
    );
    const cell = screen.getByRole("button", { name: "20" });
    expect(cell).toBeDisabled();
    fireEvent.click(cell);
    expect(onPick).not.toHaveBeenCalled();
  });
});
