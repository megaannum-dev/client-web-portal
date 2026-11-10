// D21 — "Act on request" stops (and shows the error) when the status update fails.
// D22 — a ticket can't be declined without a reason; the panel no longer promises email.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push }),
}));
vi.mock("@/hooks/usePageAccess", () => ({ useCanEdit: () => true }));
const setTicketStatus = vi.fn();
vi.mock("@/app/(roles)/rm/requests/actions", () => ({
  setTicketStatus: (...args: unknown[]) => setTicketStatus(...args),
}));

import { RequestTicketDetail } from "@/components/rm/RequestTickets";
import type { RequestTicket } from "@/lib/rm/tickets";

const TICKET: RequestTicket = {
  ref: "TCK-0001", clientId: "c-1", client: "Cathy Client", contact: "Cathy", email: "c@x.io",
  model: "Alpha", modelId: "m-1", account: "U-1", type: "Allotment", ccy: "USD", cash: "100,000",
  mult: "2x", date: "Nov 10", status: "New", tone: "pending", message: "Please allot",
};

const actButton = () => screen.getByRole("button", { name: /act on request/i });
const declineButton = () => screen.getByRole("button", { name: /decline request/i });

describe("D21 Act on request", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows the error and does not navigate when the status update fails", async () => {
    setTicketStatus.mockResolvedValue({ success: false, error: "Ticket is already closed" });
    const onRefetch = vi.fn();
    render(<RequestTicketDetail ticket={TICKET} onRefetch={onRefetch} />);

    fireEvent.click(actButton());

    expect(await screen.findByText("Ticket is already closed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(onRefetch).not.toHaveBeenCalled();
  });

  it("navigates to Model Subscription with the ticket ref once the update succeeds", async () => {
    setTicketStatus.mockResolvedValue({ success: true, data: {} });
    render(<RequestTicketDetail ticket={TICKET} onRefetch={vi.fn()} />);

    fireEvent.click(actButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith(
      "/rm/model-subscription?client=c-1&model=m-1&mode=add-allotment&ticket=TCK-0001",
    ));
  });
});

describe("D22 Decline request", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("is disabled until a reason is picked, then sends that reason as the note", async () => {
    setTicketStatus.mockResolvedValue({ success: true, data: {} });
    render(<RequestTicketDetail ticket={TICKET} onRefetch={vi.fn()} />);

    expect(declineButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /select a reason/i }));
    fireEvent.click(screen.getByRole("button", { name: "Insufficient documentation" }));
    expect(declineButton()).toBeEnabled();

    fireEvent.click(declineButton());
    await waitFor(() => expect(setTicketStatus).toHaveBeenCalledWith(
      "TCK-0001", { status: "declined", note: "Insufficient documentation" },
    ));
  });

  it("keeps a custom-note decline disabled while the note is blank", () => {
    render(<RequestTicketDetail ticket={TICKET} onRefetch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /select a reason/i }));
    fireEvent.click(screen.getByRole("button", { name: "Other — add a note" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(declineButton()).toBeDisabled();
  });

  it("does not promise an email to the client", () => {
    render(<RequestTicketDetail ticket={TICKET} onRefetch={vi.fn()} />);
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Events feed/)).toBeInTheDocument();
  });
});
