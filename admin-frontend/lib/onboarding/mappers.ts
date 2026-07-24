// DTO -> view mappers. Pure functions only, no fetch logic — called by hooks.
// See docs/implementations/013-client-onboarding-integration-fe.md §6.
//
// Stitched together from three worktrees (FE-3 board half, FE-4 compliance
// half, FE-5 PC half) — each unit owns a distinct section of this file.

import type {
  AdminOnboardingRow, AllotRdmptDTO, AllotmentView, BoardDTO, DocStatus,
  KycBoardClient, KycBoardColumn, ObStatus, OnboardingDTO, RedemptionView,
} from "./types";

/* ---- FE-3: RM onboarding board -------------------------------------- */

export const COLUMN_LABELS: Record<keyof BoardDTO, string> = {
  initial: "Initial Onboarding",
  pending_review: "Pending for Resubmit",
  reviewing: "Reviewing",
  active: "Active",
};

export function mapRow(o: OnboardingDTO): KycBoardClient {
  return {
    id: o.id, userId: o.user_id, name: o.client_name, owner: o.assigned_rm, clientRef: o.client_ref,
    // widened 2026-07-20 (D-9) — read straight off the widened OnboardingDTO, no "—" fallback:
    phone: o.primary_phone, address: o.address, country: o.country_of_residence,
    idType: o.id_type, idNumber: o.id_number,
    ibhkAccount: o.ibhk_account, swAccount: o.sw_account,
    status: o.status,
    verifiedCount: o.verified_count, requiredCount: o.required_count,
    documents: o.documents,
  };
}

/** BoardDTO → the 4 kanban columns, per §4.2's status↔column mapping. */
export function mapBoardToColumns(dto: BoardDTO): KycBoardColumn[] {
  return (Object.keys(COLUMN_LABELS) as (keyof BoardDTO)[]).map((status) => ({
    label: COLUMN_LABELS[status],
    status,
    clients: dto[status].map(mapRow),
  }));
}

/* ---- FE-4: Compliance review ----------------------------------------- */

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

/* ---- FE-5: PC allotments ---------------------------------------------- */

/**
 * AllotRdmptDTO[] → AllotmentView[]. Widened 2026-07-20 (D-9): the per-model
 * aggregate multiplier (aggBefore/aggAfter) and expected-cash-in date are now
 * read straight off the DTO — both are snapshotted server-side at insert
 * time (DB B-3, Backend C-2), never recomputed here. This mapper does zero
 * aggregate computation of its own.
 */
export function mapAllotmentsToView(dtos: AllotRdmptDTO[]): AllotmentView[] {
  return dtos
    .filter((d) => d.kind === "allotment")
    .map((d) => ({
    id: d.id, ref: d.reference, modelName: d.model_name, mult: d.units, amount: d.amount,
    status: d.status, rm: d.rm, date: d.created_at, acknowledgedAt: d.acknowledged_at,
    expectedCashIn: d.expected_cash_in,
    aggBefore: d.agg_before, aggAfter: d.agg_after,
  }));
}

/* ---- FE-7: PC redemptions ---------------------------------------------- */

export function mapRedemptionsToView(dtos: AllotRdmptDTO[]): RedemptionView[] {
  return dtos
    .filter((d) => d.kind === "redemption")
    .map((d) => ({
      id: d.id, ref: d.reference, modelName: d.model_name,
      mult: d.units, amount: d.amount, status: d.status,
      rm: d.rm, date: d.created_at, emergent: d.emergent,
    }));
}
