// Coverage for the two read-only surfaces that renamed ObStatus "rejected" →
// "awaiting_docs" touched: the status chip and the onboarding stat strip. Both are
// pure functions of an AdminOnboardingRow[], so no hook/action mocking is needed.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObStatusChip } from "@/components/compliance/Shared";
import { ObStatStrip } from "@/components/compliance/review/StatStrips";
import type { AdminOnboardingRow, DocumentDTO, ObStatus } from "@/lib/onboarding/types";

function makeDoc(overrides: Partial<DocumentDTO> = {}): DocumentDTO {
  return {
    doc_type: "passport", label: "Passport", status: "verified",
    filename: "p.pdf", required: true, periodic_review: false,
    reviewed_at: null, expires_at: null, can_reupload: false,
    uploaded_by: null, uploaded_at: null, approved_at: null,
    ...overrides,
  };
}

function makeRow(id: string, status: ObStatus, documents: DocumentDTO[] = [makeDoc()]): AdminOnboardingRow {
  return {
    id, client: "Jane Doe", email: "j@x.com", phone: "+1", address: "addr", country: "US",
    idType: "passport", idNumber: "P1", ibhk: "U-1", silverwate: "SW-1",
    rm: "Alice", clientRef: "MEGA-0001", submitted: "2026-07-19T00:00:00Z",
    status, type: "Initial Onboarding", documents,
    complNote: null, decidedAt: null,
  };
}

describe("ObStatusChip", () => {
  it.each([
    ["pending", "Require Review"],
    ["approved", "Approved"],
    ["awaiting_docs", "Awaiting Resubmit"],
  ] as [ObStatus, string][])("renders %s as '%s'", (status, label) => {
    render(<ObStatusChip status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

/** The card is the label div's parent; its textContent is label + value. */
function card(label: string) {
  return screen.getByText(label).parentElement?.textContent;
}

describe("ObStatStrip", () => {
  it("counts awaiting_docs rows under 'Awaiting reprovision', separately from 'Doc issues'", () => {
    render(
      <ObStatStrip
        rows={[
          makeRow("a", "awaiting_docs", [makeDoc({ status: "pending" })]),
          makeRow("b", "awaiting_docs"),
          // "Doc issues" is a strictly under-review count: a `pending` document on a
          // `pending` cycle. The awaiting_docs rows above must NOT bleed into it.
          makeRow("c", "pending", [makeDoc({ status: "pending" })]),
          makeRow("d", "pending"),
          makeRow("e", "approved"),
        ]}
      />,
    );
    expect(card("Awaiting reprovision")).toBe("Awaiting reprovision2");
    expect(card("Pending review")).toBe("Pending review2");
    expect(card("Doc issues")).toBe("Doc issues1");
    expect(card("Approved")).toBe("Approved1");
  });
});
