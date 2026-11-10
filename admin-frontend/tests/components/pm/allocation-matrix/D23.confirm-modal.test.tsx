// D23 — a failed period confirmation must keep the modal open and show the error.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmModal } from "@/components/pm/allocation-matrix/ConfirmModal";
import type { AllocationView } from "@/lib/pm/allocation";

const DATA = { count: () => 12, liveModels: [{}, {}] } as unknown as AllocationView;

function renderModal(onConfirm: () => Promise<{ success: boolean; error?: string }>) {
  const onClose = vi.fn();
  render(<ConfirmModal data={DATA} period="Nov 2026" onClose={onClose} onConfirm={onConfirm} />);
  return { onClose };
}

describe("D23 ConfirmModal", () => {
  it("shows the server error and stays open when confirming fails", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ success: false, error: "Period is already confirmed" });
    const { onClose } = renderModal(onConfirm);

    fireEvent.click(screen.getByRole("button", { name: /confirm allocation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Period is already confirmed");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirm Nov 2026 allocation\?/)).toBeInTheDocument();
  });

  it("falls back to a generic message when the failure has no detail", async () => {
    renderModal(vi.fn().mockResolvedValue({ success: false }));
    fireEvent.click(screen.getByRole("button", { name: /confirm allocation/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed to confirm/i);
  });

  it("disables the buttons while confirming so a double click sends one request", async () => {
    let resolve!: (v: { success: boolean }) => void;
    const onConfirm = vi.fn(() => new Promise<{ success: boolean }>((r) => { resolve = r; }));
    const { onClose } = renderModal(onConfirm);

    const confirm = screen.getByRole("button", { name: /confirm allocation/i });
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: /confirming/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    resolve({ success: true });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
