import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithAuth as render } from "@/tests/_helpers/renderWithAuth";
import { SubscriptionAccordion } from "@/components/rm/SubscriptionAccordion";
import type { SubClient, TxnRow } from "@/lib/rm/subscriptions";

vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => ({ portalUser: { role: "RM", grants: { "rm.model-subscription": "EDIT" } } }),
}));

const fileTransactionDetail = vi.fn();
vi.mock("@/app/(roles)/rm/model-subscription/actions", () => ({
  fileTransactionDetail: (...a: unknown[]) => fileTransactionDetail(...a),
  getTransactionDetail: vi.fn(),
}));

function renderRow(status: "pending" | "acknowledged") {
  const row: TxnRow = ["Allotment", "01/01/2026", "IB-4471", "USD", "200,000", "2×", "200,000", "01/01/2026", "—", status, "txn-1", false];
  const client: SubClient = {
    id: "c-1", name: "Ardent Capital", initials: "AC", mandate: "Discretionary", aum: "$2.0M",
    models: [{ name: "Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-4471", modelId: "m-1", units: 5, rows: [row] }],
  };
  render(<SubscriptionAccordion clients={[client]} onOpenModal={() => {}} initialOpenClient="c-1" initialOpenModelKey="c-1-0" />);
}

beforeEach(() => {
  fileTransactionDetail.mockReset();
  document.body.innerHTML = '<div id="content-overlay-root"></div>';
});

describe("transaction detail filing gate", () => {
  it("a pending allotment shows 'Pending Acknowledgement' and opens no modal on click", () => {
    renderRow("pending");
    expect(screen.getByText("Pending Acknowledgement")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Allotment"));
    expect(screen.queryByPlaceholderText(/HSBC-4471-001/)).not.toBeInTheDocument();
  });

  it("an acknowledged allotment opens the modal, and a failed save keeps it open with the error", async () => {
    fileTransactionDetail.mockResolvedValue({ success: false, error: "Transaction details already filed", code: "CONFLICT" });
    renderRow("acknowledged");
    fireEvent.click(screen.getByText("Allotment"));
    expect(screen.getByPlaceholderText(/HSBC-4471-001/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/HSBC-4471-001/), { target: { value: "ACC-1" } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-03-01" } });
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText("Transaction details already filed")).toBeInTheDocument();
    await waitFor(() => expect(fileTransactionDetail).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText(/HSBC-4471-001/)).toBeInTheDocument();
  });
});
