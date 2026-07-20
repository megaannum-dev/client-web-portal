// DTO -> view mappers for the RM onboarding board (FE-3). Pure functions,
// no fetch logic — called only by hooks/api/useOnboardingBoard.ts.
// See docs/implementations/013-client-onboarding-integration-fe.md §6 FE-3.
import type { BoardDTO, KycBoardClient, KycBoardColumn, OnboardingDTO } from "./types";

export const COLUMN_LABELS: Record<keyof BoardDTO, string> = {
  initial: "Initial Onboarding",
  reviewing: "Reviewing",
  pending_review: "Pending for Review",
  active: "Active",
};

export function mapRow(o: OnboardingDTO): KycBoardClient {
  return {
    id: o.id, name: o.client_name, owner: o.assigned_rm, clientRef: o.client_ref,
    // widened 2026-07-20 (D-9) — read straight off the widened OnboardingDTO, no "—" fallback:
    phone: o.primary_phone, address: o.address, country: o.country_of_residence,
    idType: o.id_type, idNumber: o.id_number,
    ibhkAccount: o.ibhk_account, swAccount: o.sw_account,
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
