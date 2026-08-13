// §7.1 DTOs verbatim, plus the admin-side view types each page's existing
// components already expect. See docs/implementations/013-client-onboarding-integration-fe.md §6 FE-1.

export type OnboardingStatus = "initial" | "reviewing" | "pending_review" | "active";
export type OnboardingKind   = "initial" | "renewal";
export type DocStatus        = "not_started" | "uploaded" | "in_review" | "verified" | "pending" | "rejected" | "expired";
export type AllotRdmpStatus =
  | "pending"        // existing
  | "acknowledged"   // existing
  | "awaiting_pc"    // NEW — redemption submitted, needs PC approval
  | "awaiting_co"    // NEW — redemption submitted, needs Compliance approval (amount > $300k)
  | "approved"       // NEW — redemption fully approved, took effect
  | "rejected";      // NEW — redemption rejected by PC or CO
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
  // Client Preference step (FE-17) — all optional, omitted entirely when blank.
  occupation?: string;
  date_of_birth?: string;                     // "YYYY-MM-DD"
  anniversary?: string;                        // "YYYY-MM-DD"
  spouse_name?: string;
  children?: string;
  personal_interests?: string;
  communication_preferences?: string;
  gift_hospitality_preferences?: string;
  relationship_notes?: string;
}

export interface RmOptionDTO { uid: string; name: string; }
export interface DocSpecDTO { doc_type: string; label: string; required: boolean; }

export interface DocumentDTO {
  doc_type: string; label: string; status: DocStatus;
  filename: string | null; required: boolean; periodic_review: boolean;
  issue_note: string | null; reviewed_at: string | null; expires_at: string | null;
  can_reupload: boolean;
  uploaded_by: string | null; uploaded_at: string | null; approved_at: string | null;
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
  // True while the cycle is waiting on re-provisioned documents (Compliance's ad-hoc
  // request, or the renewal scheduler) rather than having been rejected — both land on
  // status="pending_review", so this is the only thing separating them on the wire.
  // Temporary: the backend intends to collapse it into OnboardingStatus later.
  awaiting_reprovision: boolean;
  submitted_at: string | null; created_at: string;
  documents: DocumentDTO[];   // present on detail/board rows; absent only if backend omits on a summary view
}

export interface BoardDTO {
  initial: OnboardingDTO[]; reviewing: OnboardingDTO[];
  pending_review: OnboardingDTO[]; active: OnboardingDTO[];
}

export interface VerdictReq { verdict: "valid" | "issue"; note?: string | null; }
export interface RejectReq  { reason?: string | null; }

// Batch verdict — supersedes the per-doc VerdictReq above. The panel buffers every
// Valid/Issue toggle locally and POSTs the whole set once, at Approve/Reject.
export interface VerdictItem { doc_type: string; verdict: "valid" | "issue"; note?: string | null; }
export interface VerdictBatchReq { items: VerdictItem[]; }   // backend requires min_length=1

// Compliance's ad-hoc "require new documents" request on an ACTIVE client.
export interface ReprovisionReq { doc_types: string[]; reason?: string | null; }

export interface SubmitAllotmentReq {
  client_id: string;             // uuid.UUID as string
  model_id: string;              // uuid.UUID as string
  multiplier: number;            // Decimal-as-number — number of units
  expected_cash_in: string | null;  // ISO date "YYYY-MM-DD", nullable
  mgmt_fee?: number | null;      // only populated for new-subscription mode
  incentive_fee?: number | null; // only populated for new-subscription mode
  source_ticket_ref?: string;    // originating ticket ref, when submitted via Act-on-request deep-link
}

export interface SubmitRedemptionReq {
  client_id: string;
  model_id: string;
  multiplier: number;             // units to redeem
  expected_cash_out: string | null;
  emergent?: boolean;             // default false
  source_ticket_ref?: string;     // originating ticket ref, when submitted via Act-on-request deep-link
}

export interface RedemptionDecisionReq {
  verdict: "approve" | "reject";
  reason?: string | null;         // required when verdict === "reject"
}

export interface AllotRdmptDTO {
  id: string; reference: string;
  model_id: string; model_name: string; units: number; amount: number;
  kind: AllotRdmpKind; status: AllotRdmpStatus; note: string | null;
  agg_before: number; agg_after: number;                       // widened 2026-07-20 — snapshotted server-side at insert (DB B-3), never recomputed here
  expected_cash_in: string | null;                             // widened 2026-07-20 — settlement date, snapshotted at insert time
  rm: string; created_at: string; acknowledged_at: string | null;
  emergent: boolean;                    // widened 2026-07-23 (BE-6) — server always sends this now
  expected_cash_out: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  has_transaction_detail: boolean;      // widened 2026-07-24 (proposal 017, BE-4) — true when a transaction_details row exists
}

/* ---- Transaction Detail (settlement filing) — proposal 017 §4.1 --------- */
export interface TransactionDetailRequest {
  bank_account: string;
  settlement_amount: number;       // Decimal-as-number
  transaction_date: string;        // "YYYY-MM-DD"
  transaction_time: string;        // "HH:MM" or "HH:MM:SS"
  currency: string;                // one of USD | CHF | AUD | GBP | EUR | CAD | HKD
  reference_no?: string | null;
}

export interface TransactionDetailDTO {
  id: string;
  allotment_id: string;
  bank_account: string;
  settlement_amount: number;
  transaction_date: string;
  transaction_time: string;
  currency: string;
  reference_no: string | null;
  filed_by: string;
  filed_at: string;
}

export interface SubscriptionDTO { model_id: string; model_name: string; units: number; ib_account: string | null; }
export interface ClientEventDTO  { id: string; category: string; title: string; body: string; created_at: string; }

/** Client-detail page's Contact Log card. */
export interface ContactLogEntryDTO {
  id: string;
  topic: string;
  channel: string;
  occurred_at: string;
  description: string;
  interest: string | null;
  complaint: string | null;
  follow_up: string | null;
  logged_by: string;
  doc_filename: string | null;
  doc_size_bytes: number | null;
  created_at: string;
}

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
/** A document's review verdict as the Compliance panel renders it. `null` = not reviewed. */
export type DocVerdict = "valid" | "issue" | null;
export interface AdminOnboardingRow {
  id: string; client: string; email: string;
  phone: string; address: string; country: string;
  idType: string; idNumber: string;
  ibhk: string; silverwate: string;
  rm: string; clientRef: string; submitted: string; status: ObStatus; type: string;
  documents: DocumentDTO[];
  rejectReason: string | null;
  // OB_STATUS_MAP collapses backend `pending_review` to status "rejected", which is
  // wrong for a row that is merely awaiting re-provisioned documents. When this is
  // true, read `status: "rejected"` as "awaiting re-provision" instead.
  awaitingReprovision: boolean;
}

export interface RedemptionView {
  id: string; ref: string; modelName: string; mult: number; amount: number;
  status: AllotRdmpStatus; rm: string; date: string; emergent?: boolean;
}

export interface AllotmentView {
  id: string; ref: string; modelName: string; mult: number; amount: number;
  status: AllotRdmpStatus; rm: string; date: string; acknowledgedAt: string | null;
  expectedCashIn: string | null;        // sourced directly from AllotRdmptDTO.expected_cash_in
  aggBefore: number; aggAfter: number;  // sourced directly from AllotRdmptDTO.agg_before/agg_after, see FE-5
}
