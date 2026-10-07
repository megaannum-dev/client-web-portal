import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorrespondentsToolbar } from "@/components/rm/correspondents/CorrespondentsToolbar";
import { INITIAL_UI } from "@/components/rm/correspondents/toQuery";
import type { ChatDocumentSender } from "@/lib/api/chat";

const senders: ChatDocumentSender[] = [
  { uid: "u1", name: "Sam Client", role: "client", client_name: "Acme Ltd" },
  { uid: "u2", name: "Rita RM", role: "rm", client_name: null },
];

describe("Sender popover", () => {
  it("search never matches the text 'null' for staff", () => {
    render(<CorrespondentsToolbar ui={INITIAL_UI} setUi={vi.fn()} senders={senders} meUid={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Sender/ }));
    fireEvent.change(screen.getByLabelText("Find a sender"), { target: { value: "null" } });
    expect(screen.getByText("No senders")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a sender"), { target: { value: "acme" } });
    expect(screen.getByText("Sam Client")).toBeInTheDocument();
    expect(screen.queryByText("Rita RM")).toBeNull();
  });
});

describe("View pills", () => {
  it("render Sent, Received, Recent left to right", () => {
    render(<CorrespondentsToolbar ui={INITIAL_UI} setUi={vi.fn()} senders={[]} meUid={null} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels.slice(0, 3)).toEqual(["Sent", "Received", "Recent"]);
  });
});

describe("Date filter (DateControl)", () => {
  it("picking a day sets from = to; Any time label when unset", () => {
    const setUi = vi.fn();
    render(<CorrespondentsToolbar ui={INITIAL_UI} setUi={setUi} senders={[]} meUid={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Any time" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    const d = setUi.mock.calls[0][0] as { from: string; to: string };
    expect(d.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(d.to).toBe(d.from);
  });
  it("shows the active range label and Clear resets", () => {
    const setUi = vi.fn();
    render(<CorrespondentsToolbar ui={{ ...INITIAL_UI, from: "2026-03-05", to: "2026-03-09" }} setUi={setUi} senders={[]} meUid={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Mar 05, 2026 – Mar 09, 2026" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0]);
    expect(setUi).toHaveBeenCalledWith({ from: "", to: "" });
  });
});
