// DTO -> view mappers. Pure functions only, no fetch logic — called by hooks.
// See docs/implementations/013-client-onboarding-integration-fe.md §6.
//
// NOTE: this file is stitched together from three worktrees (FE-3 board half,
// FE-4 compliance half, FE-5 PC half); this copy holds ONLY the compliance half.

import type { AdminOnboardingRow, DocStatus, ObStatus, OnboardingDTO } from "./types";

/** §4.2's frozen status projection: DB OnboardingStatus → Compliance's own ObStatus. */
const OB_STATUS_MAP: Partial<Record<OnboardingDTO["status"], ObStatus>> = {
  reviewing: "pending",
  pending_review: "rejected",
  active: "approved",
  // "initial" never appears in GET /api/compliance/onboardings (RM hasn't submitted yet).
};

export function mapOnboardingToRow(o: OnboardingDTO): AdminOnboardingRow {
  return {
    id: o.id, client: o.client_name, email: o.email,
    // widened 2026-07-20 (D-9) — read straight off the widened OnboardingDTO, no "—" fallback:
    phone: o.primary_phone, address: o.address, country: o.country_of_residence,
    idType: o.id_type, idNumber: o.id_number,
    ibhk: o.ibhk_account, silverwate: o.sw_account,
    rm: o.assigned_rm, clientRef: o.client_ref, submitted: o.submitted_at ?? o.created_at,
    status: OB_STATUS_MAP[o.status] ?? "pending",
    type: o.kind === "renewal" ? "Yearly Renewal" : "Initial Onboarding",
    documents: o.documents,
    rejectReason: o.reject_reason,
  };
}

/** DocStatus → the DocVerdict tri-state the existing DocRow/RejectModal render. */
export function docStatusToVerdict(status: DocStatus): "valid" | "issue" | null {
  if (status === "verified") return "valid";
  if (status === "rejected") return "issue";
  return null;
}
