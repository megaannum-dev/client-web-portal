// §7.1 DTOs verbatim, plus the admin-side view types each page's existing
// components already expect. See docs/implementations/013-client-onboarding-integration-fe.md §6 FE-1.

export type OnboardingStatus = "initial" | "reviewing" | "pending_review" | "active";
export type OnboardingKind   = "initial" | "renewal";
export type DocStatus        = "not_started" | "uploaded" | "in_review" | "verified" | "rejected" | "expired";
export type AllotRdmpStatus  = "pending" | "acknowledged";
export type AllotRdmpKind    = "allotment" | "redemption";

export interface StartOnboardingReq {
  client_name: string; email: string; primary_phone: string;
  address: string; country_of_residence: string;
  id_type: string; id_number: string;
  ibhk_account: string; sw_account: string;
  model_id: string; units: number;
  initial_cash_deposit: number;              // Decimal-as-number, see BE-8
  mgmt_fee: number; incentive_fee: number;   // fractions, e.g. 0.015 — see FE-9
  kind?: OnboardingKind;                      // defaults "initial" server-side
  assigned_rm_uid?: string | null;            // ADMIN-only override; ignored server-side for any other caller
}

export interface RmOptionDTO { uid: string; name: string; }
export interface DocSpecDTO { doc_type: string; label: string; required: boolean; }

export interface DocumentDTO {
  doc_type: string; label: string; status: DocStatus;
  filename: string | null; required: boolean; periodic_review: boolean;
  issue_note: string | null; reviewed_at: string | null; expires_at: string | null;
  can_reupload: boolean;
}

export interface OnboardingDTO {   // widened 2026-07-20 for full field parity with the pre-existing RM/Compliance mocks — see D-9
  id: string; user_id: string;
  client_name: string; email: string; assigned_rm: string;   // assigned_rm: RM display name, resolved server-side from assigned_rm_uid
  client_ref: string;                                          // display code e.g. "MEGA-0481" — server-formatted, not stored
  primary_phone: string; address: string; country_of_residence: string;   // joined from ClientProfile, not duplicated onto client_onboardings
  id_type: string; id_number: string;                          // genuinely new columns on client_onboardings (D-9)
  ibhk_account: string; sw_account: string;                    // already existed on client_onboardings; this widening only adds them to the DTO
  status: OnboardingStatus; kind: OnboardingKind;
  model_id: string; model_name: string; units: number;
  mgmt_fee: number; incentive_fee: number;                     // the agreed fee as captured at onboarding; JSON numbers per §3.1's Decimal-as-number convention
  verified_count: number; required_count: number;
  reject_reason: string | null;
  submitted_at: string | null; created_at: string;
  documents: DocumentDTO[];   // present on detail/board rows; absent only if backend omits on a summary view
}

export interface BoardDTO {
  initial: OnboardingDTO[]; reviewing: OnboardingDTO[];
  pending_review: OnboardingDTO[]; active: OnboardingDTO[];
}

export interface VerdictReq { verdict: "valid" | "issue"; note?: string | null; }
export interface RejectReq  { reason?: string | null; }

export interface AllotRdmptDTO {
  id: string; reference: string;
  model_id: string; model_name: string; units: number; amount: number;
  kind: AllotRdmpKind; status: AllotRdmpStatus; note: string | null;
  agg_before: number; agg_after: number;                       // widened 2026-07-20 — snapshotted server-side at insert (DB B-3), never recomputed here
  expected_cash_in: string | null;                             // widened 2026-07-20 — settlement date, snapshotted at insert time
  rm: string; created_at: string; acknowledged_at: string | null;
}

export interface SubscriptionDTO { model_id: string; model_name: string; units: number; ib_account: string | null; }
export interface ClientEventDTO  { id: string; category: string; title: string; body: string; created_at: string; }

/* ---- Model Subscription read endpoints (Goal 9, FE-6) --------------------- */
export interface ClientSubscriptionRowDTO {
  model_id: string; model_name: string; units: number;
  mgmt_fee: number; incentive_fee: number;   // effective = override ?? Model default (013 C-5's read-side coalesce)
  ib_account: string | null;
  amount: number;   // = units * model.model_size — mirrors AllotRdmptDTO.amount
}
export interface ClientSubscriptionsDTO {
  client_id: string; client_name: string;
  subscriptions: ClientSubscriptionRowDTO[];
}

/* ---- Admin-side VIEW types — what OnboardingBoard.tsx/ObDetailPanel/
   AllotDetailPanel actually render. Replace the deleted mock types
   1:1 in shape so the components' JSX is untouched (FE-3/4/5). ---- */

export interface KycBoardClient {
  id: string; userId: string; name: string; owner: string; clientRef: string;
  phone: string; address: string; country: string;
  idType: string; idNumber: string;
  ibhkAccount: string; swAccount: string;
  status: OnboardingStatus;
  verifiedCount: number; requiredCount: number;
  documents: DocumentDTO[];
}
export interface KycBoardColumn { label: string; status: OnboardingStatus; clients: KycBoardClient[]; }

export type ObStatus = "pending" | "approved" | "rejected";
export interface AdminOnboardingRow {
  id: string; client: string; email: string;
  phone: string; address: string; country: string;
  idType: string; idNumber: string;
  ibhk: string; silverwate: string;
  rm: string; clientRef: string; submitted: string; status: ObStatus; type: string;
  documents: DocumentDTO[];
  rejectReason: string | null;
}

export interface AllotmentView {
  id: string; ref: string; modelName: string; mult: number; amount: number;
  status: AllotRdmpStatus; rm: string; date: string; acknowledgedAt: string | null;
  expectedCashIn: string | null;        // sourced directly from AllotRdmptDTO.expected_cash_in
  aggBefore: number; aggAfter: number;  // sourced directly from AllotRdmptDTO.agg_before/agg_after, see FE-5
}
