// D09 follow-up: Approve (passed as children) is hidden while the reject reason is being written.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RejectReason } from "@/components/ui/RejectReason";

function setup() {
  const onReject = vi.fn();
  render(
    <RejectReason onReject={onReject}>
      <button>Approve</button>
    </RejectReason>,
  );
  return onReject;
}

describe("RejectReason", () => {
  it("shows Approve until Reject is clicked, and again after Cancel", () => {
    setup();
    expect(screen.getByText("Approve")).toBeTruthy();

    fireEvent.click(screen.getByText("Reject"));
    expect(screen.queryByText("Approve")).toBeNull();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Approve")).toBeTruthy();
  });

  it("only confirms with a non-blank reason, and sends it trimmed", () => {
    const onReject = setup();
    fireEvent.click(screen.getByText("Reject"));
    const confirm = screen.getByText("Confirm reject").closest("button")!;

    fireEvent.change(screen.getByLabelText("Reason for rejection"), { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Reason for rejection"), { target: { value: "  too large  " } });
    fireEvent.click(confirm);
    expect(onReject).toHaveBeenCalledWith("too large");
  });
});
