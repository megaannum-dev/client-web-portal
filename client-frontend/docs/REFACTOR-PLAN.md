# Refactor Plan — Wilson Feedback (Meeting 20 May 2026)

> Status: **Draft — pending clarification on open questions**
> Author: Claude Code · 2026-05-28

---

## Overview

Five areas of change, ranked by priority. Items marked **[OPT]** are optional scope from Wilson's list.

---

## 1. Portfolio Page — Allotment / Redemption Ticket Flow

**Goal:** Surface the ticket-raising UX more prominently and make the historical requests table feel like a first-class log.

### 1a. "Raise a Ticket" entry point

The current UX buries allotment behind an "Allot" button on each Available Model row, and redemption behind a "Redeem" button on each Allotted Model row. Wilson's request implies a more unified, discoverable entry point.

**Proposed change:**
- Add a primary **"Raise a Ticket"** button in the `<PageHeader>` actions area (right side of the header row).
- The button opens a two-step modal:
  1. **Step 1 — Type selector**: cards for "Allotment" and "Redemption".
  2. **Step 2 — Form**: routes to the existing `AllotmentModal` or `RedemptionModal` content.
- Keep the inline Allot/Redeem row buttons as shortcuts that skip Step 1 and pre-select the model.

**Files to touch:**
| File | Change |
|---|---|
| `app/(dashboard)/portfolio/page.tsx` | Add `RaiseTicketModal` wrapper component; wire "Raise a Ticket" button in `<PageHeader>` |
| `components/ui/PageHeader.tsx` | Ensure `actions` prop slot exists (check current API) |

### 1b. Historical Requests — "(Hist)" disambiguation

The existing **Historical Requests** section already exists at the bottom of the portfolio page. No structural change is needed — the "(Hist)" notation in the brief appears to confirm this section should remain alongside the ticket flow, not replace it.

**Action:** Confirm with Wilson whether any changes are required to the historical table (columns, pagination, filtering by type, date range picker, etc.).

### 1c. Display model limits and IB account on Allotted Models

**Current state (bug found):** `ALLOTTED_COLS` declares 10 column headers including "Model Limits" and "Assoc IB Accnt", but:
- The grid template `ALLOTTED_GRID = "11rem repeat(6, minmax(0, 1fr)) 7rem"` only has **8** column slots.
- The rendered `<ModelRow>` only outputs **7** data cells + 1 action button.
- `AllottedModel` type in `lib/mock/data.ts` has no `modelLimit` or `ibAccount` fields.

**Fix required:**
1. Add `modelLimit: string` and `ibAccount: string` to the `AllottedModel` interface in `lib/mock/data.ts`.
2. Populate mock values in `MOCK_ALLOTTED_MODELS`.
3. Update `ALLOTTED_GRID` to `"11rem repeat(8, minmax(0, 1fr)) 7rem"` (10 total slots).
4. Add two `<div>` cells for `modelLimit` and `ibAccount` in the `<ModelRow>` render block inside `PortfolioPage`.

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | Add `modelLimit`, `ibAccount` to `AllottedModel`; populate `MOCK_ALLOTTED_MODELS` |
| `app/(dashboard)/portfolio/page.tsx` | Fix `ALLOTTED_GRID`, add two data cells in row render |

---

## 2. Profile Page — Editable Personal Information

**Goal:** The pencil icon on the Personal Information card already renders but is wired to nothing. Make the section inline-editable.

### Design

- Clicking the pencil icon switches all `<ProfileField>` labels to `<input>` / `<select>` fields pre-filled with current values.
- Two buttons appear at the bottom of the section: **Save** and **Cancel**.
- Save writes to `localStorage` (mock layer) and updates displayed values; Cancel reverts.
- Fields: Full Name, Phone Number, Email, Company, Occupation, Residential Address, Location of Residence.

**Implementation steps:**
1. Introduce `editing: boolean` state in `ProfilePage`.
2. Create `EditableProfileField` component — renders `<input>` when editing, plain text otherwise.
3. Maintain a `draft` state object mirroring all field values; commit on Save, discard on Cancel.
4. Persist to `localStorage` under a new `STORE_KEYS.profileInfo` key in `lib/mock/store.ts` / `lib/mock/data.ts`.
5. On mount, read from `localStorage` and hydrate initial state (same pattern as `kycStatus`).

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | Add `ProfileInfo` interface and `STORE_KEYS.profileInfo` key |
| `lib/mock/store.ts` | Add `getProfileInfo` / `setProfileInfo` helpers |
| `app/(dashboard)/profile/page.tsx` | Implement `editing` state, `EditableProfileField`, Save/Cancel flow |

---

## 3. Profile Page — Additional Document Upload Section

**Goal:** Add a new `<SectionCard>` below "Document Verification" for uploading document types beyond KYC and AML.

### Design

- Title: **"Other Documents"** (or "Supporting Documents" — confirm preference).
- A grid of upload slots, each representing a document category:
  - Source of Funds
  - Bank Statement
  - Tax Identification / W-8BEN
  - Proof of Address
  - Other (free-label)
- Each slot shows upload status (Not Uploaded / Processing / Verified) with the same badge system used by KYC/AML.
- Clicking "Upload" on any slot opens a generalised `DocumentUploadModal` (reuse the pattern of `KycUploadModal` but accept `docCategory` as a prop to title the modal correctly).

**Implementation steps:**
1. Extend `lib/mock/data.ts` — add `OtherDocEntry` type and `MOCK_OTHER_DOCS` array.
2. Add `STORE_KEYS.otherDocs` key for localStorage persistence.
3. Extract a generic `DocumentUploadModal` component from the existing `KycUploadModal` (which is currently hard-coded to KYC types).
4. Add the new `<SectionCard id="other-documents">` section in `profile/page.tsx`.

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | `OtherDocEntry` type, `MOCK_OTHER_DOCS`, `STORE_KEYS.otherDocs` |
| `lib/mock/store.ts` | Helpers for other-doc status read/write |
| `app/(dashboard)/profile/page.tsx` | New section card; extract `DocumentUploadModal` |

---

## 4. Header — "Contact RM" with RM Contact Details

**Goal:** The current "Contact Advisor" button in the `HelpCircle` popup (see `HeaderActions.tsx:39`) should be renamed "Contact RM" and, when clicked, display the assigned RM's **email address** and **WhatsApp number**.

### Design

- On click, show a small dropdown/popover (same hover-card pattern already used) containing:
  - RM display name
  - Email link (`mailto:`)
  - WhatsApp link (`https://wa.me/<number>`)
- Mock RM data added to `lib/mock/data.ts`.

**Implementation steps:**
1. Add `RmContact` type and `MOCK_RM_CONTACT` to `lib/mock/data.ts`.
2. Update `HeaderActions.tsx`:
   - Rename "Contact Advisor" → "Contact RM".
   - On click, open a popover showing name, email (`mailto:` link), and WhatsApp (`wa.me` link) icon button.
3. Popover can reuse the existing `group-hover` card pattern or switch to a click-toggled `useState` approach for better mobile/keyboard accessibility.

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | `RmContact` interface, `MOCK_RM_CONTACT` |
| `components/header/HeaderActions.tsx` | Rename button, wire RM contact popover |

---

## 5. [OPT] Documents Page — Legal Documents Section

**Goal:** Include Terms of Service and other legal documents in the portal.

### Options

**A. New sidebar page** — Add a "Legal" or "Documents" entry to the sidebar nav with its own page listing downloadable PDFs (ToS, Privacy Policy, Fund Prospectus, etc.).

**B. New section on existing Documents page** — If a Documents page already exists (currently not visible in the sidebar but implied by the EOM reports mock data), add a "Legal Documents" sub-section.

Recommendation: **Option A** — a dedicated page is cleaner and easier to extend.

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | `LegalDocument` type, `MOCK_LEGAL_DOCS` array |
| `app/(dashboard)/legal/page.tsx` | New page (or `documents/page.tsx` if merged) |
| `components/sidebar/SidebarNav.tsx` | Add nav entry |

---

## 6. [OPT] Events Page — "Others" Category

**Goal:** Add an "Others" filter pill to the Events page.

**Current state:** `FILTERS` in `app/(dashboard)/events/page.tsx:28` is `["All Types", "Market News", "Account Notification", "Requests Status"]`. The `EventCategory` type in `lib/mock/data.ts:16` lists the same three categories.

**Change:**
1. Add `"Others"` to the `EventCategory` union in `lib/mock/data.ts`.
2. Add `"Others"` to the `FILTERS` array in `events/page.tsx`.
3. Add at least one `"Others"` mock event entry to `MOCK_EVENT_ITEMS` to validate the filter.

**Files to touch:**
| File | Change |
|---|---|
| `lib/mock/data.ts` | Extend `EventCategory` union; add mock entry |
| `app/(dashboard)/events/page.tsx` | Add to `FILTERS` array |

---

## Open Questions

The following items are ambiguous and need answers from Wilson before implementation begins.

| # | Item | Question |
|---|---|---|
| Q1 | Portfolio — Ticket UX | Should "Raise a Ticket" replace the inline Allot/Redeem row buttons entirely, or coexist as a supplementary entry point? |
| Q2 | Portfolio — Historical | Does the "(Hist)" suffix signal any specific changes to the historical table (e.g., pagination, date filtering, export)? Or is it just acknowledging the existing section? |
| Q3 | Portfolio — IB Account | What does "Associated IB Account" mean in context? Is it an Interactive Brokers account number, an internal account ID, or something else? How many IB accounts can be associated per model? |
| Q4 | Profile — Edit scope | Should email be editable from the Profile page, or is it locked to the auth provider (Firebase)? |
| Q5 | Profile — Other Docs | What is the preferred section title: "Other Documents", "Supporting Documents", or something else? Which specific document categories should be listed? |
| Q6 | Header — Contact RM | Is "Contact RM" a global button (same RM for all users) or per-user (RM assignment is stored on the backend user record)? For the mock phase, a single static RM record is assumed. |
| Q7 | Header — Rename | Should the existing "Contact Advisor" text in the help popup be renamed to "Contact RM", or should "Contact RM" be a new, separate button? |
| Q8 | Legal Docs | What documents should be listed (ToS, Privacy Policy, Prospectus, others)? Are they downloadable PDFs or external links? |
| Q9 | RM WhatsApp | Should the WhatsApp link open the web interface (`wa.me`) or a native deep link? Should there be a phone number displayed alongside, or just a WhatsApp icon? |

---

## Implementation Order

Once open questions are resolved, recommended build sequence:

```
1. lib/mock/data.ts  — all type/data additions (unblocks everything else)
2. Portfolio § 1c   — bug fix for allotted models table (standalone, low-risk)
3. Events § 6       — smallest change, good warm-up
4. Header § 4       — isolated to two files
5. Portfolio § 1a   — new modal component
6. Profile § 2      — editable fields
7. Profile § 3      — new document section
8. Documents § 5    — new page + sidebar entry (optional)
```

Each item can be reviewed independently since they touch separate pages/components with no cross-dependencies (except the shared mock data layer, which should be done first).
