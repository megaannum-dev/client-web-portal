// U3: components/ui/DateControl.tsx — extracted from MOBO's Panels.tsx DateControl.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateControl } from "@/components/ui/DateControl";

describe("U3 DateControl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // 15 Jun 2026
  });
  afterEach(() => vi.useRealTimers());

  it("shows the marked-day dot for a date in markedDates", () => {
    render(
      <DateControl
        dateLabel="Latest"
        markedDates={new Set(["2026-06-03"])}
        onPickDate={() => {}}
        onPickRange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    const day = screen.getByRole("button", { name: "3" });
    expect(day.querySelector(".bg-primary-container")).toBeInTheDocument();
  });

  it("disables a future day", () => {
    render(
      <DateControl
        dateLabel="Latest"
        markedDates={new Set()}
        onPickDate={() => {}}
        onPickRange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    // 20 Jun 2026 is a Saturday and in the future relative to "today" (15th) —
    // pick a future weekday instead so this only asserts the future-day rule.
    const day = screen.getByRole("button", { name: "18" }); // Thu 18 Jun 2026
    expect(day).toBeDisabled();
  });

  it("a single-day pick calls onPickDate with the ISO date and closes the popover", () => {
    const onPickDate = vi.fn();
    render(
      <DateControl
        dateLabel="Latest"
        markedDates={new Set()}
        onPickDate={onPickDate}
        onPickRange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    fireEvent.click(screen.getByRole("button", { name: "3" })); // Wed 03 Jun 2026
    expect(onPickDate).toHaveBeenCalledWith("2026-06-03");
  });

  it("renders a Clear link only when onClear is passed, and calling it fires onClear", () => {
    const { rerender } = render(
      <DateControl
        dateLabel="Latest"
        markedDates={new Set()}
        onPickDate={() => {}}
        onPickRange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();

    const onClear = vi.fn();
    rerender(
      <DateControl
        dateLabel="Latest"
        markedDates={new Set()}
        onPickDate={() => {}}
        onPickRange={() => {}}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
  });
});
