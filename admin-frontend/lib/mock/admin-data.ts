/* ============================================================
   Admin console — seed mock data
   Ported from admin/admin-app/AdminData.jsx + ProtoStore.jsx (SEED_AUDIT).
   Throwaway: swapped for a real fetch once a backend exists (see
   lib/admin/types.ts header).
   ============================================================ */
import type { AdminUser, AuditEntry, Override } from "@/lib/admin/types";

export const TODAY = "27 Jul 2026";

export const ADMIN_USERS: AdminUser[] = [
  { initials: "AR", name: "Amara Rahim", email: "a.rahim@megaannum.ai", role: "RM", dept: "Private Wealth", status: "Active", tone: "active", seen: "Today 09:41" },
  { initials: "JL", name: "Jonas Lindqvist", email: "j.lindqvist@megaannum.ai", role: "MOBO", dept: "Operations", status: "Active", tone: "active", seen: "Today 08:14" },
  { initials: "SP", name: "Sofia Petrova", email: "s.petrova@megaannum.ai", role: "PC", dept: "Portfolio Control", status: "Initiated", tone: "pending", seen: "—" },
  { initials: "DK", name: "Daniel Kowalski", email: "d.kowalski@megaannum.ai", role: "COMPLIANCE", dept: "Risk & Compliance", status: "Active", tone: "active", seen: "Yesterday" },
  { initials: "MT", name: "Mei Tanaka", email: "m.tanaka@megaannum.ai", role: "PM", dept: "Investments", status: "Deactivated", tone: "neutral", seen: "14 Jul" },
  { initials: "OB", name: "Omar Bakri", email: "o.bakri@megaannum.ai", role: "ADMIN", dept: "Technology", status: "Active", tone: "active", seen: "Today 09:02" },
];

export const ADMIN_OVERRIDES: Override[] = [
  { id: "o1", initials: "SP", name: "Sofia Petrova", role: "PC", page: "Investment Guideline", path: "/pc/guidelines", from: "none", to: "view", why: "Covering guideline sign-off during Q3", by: "Omar Bakri", exp: "30 Sep 2026", soon: true },
  { id: "o2", initials: "JL", name: "Jonas Lindqvist", role: "MOBO", page: "Model Subscription", path: "/rm/subscription", from: "view", to: "edit", why: "Handles subscription corrections", by: "Omar Bakri", exp: "No expiry", soon: false },
  { id: "o3", initials: "AR", name: "Amara Rahim", role: "RM", page: "Post-Trade Allocation", path: "/mobo/allocation", from: "none", to: "view", why: "Client queries on allocations", by: "Omar Bakri", exp: "31 Dec 2026", soon: false },
];

export const ADMIN_AUDIT: AuditEntry[] = [
  { id: "a3", ts: "12 Jul 2026 · 16:20", who: "Omar Bakri", what: "Published 2 access changes", detail: "COMPLIANCE gains Guideline Review · Edit; PM loses Allocation Matrix · Edit" },
  { id: "a2", ts: "09 Jul 2026 · 11:04", who: "Omar Bakri", what: "Override granted", detail: "Jonas Lindqvist · Model Subscription · View → Edit · no expiry" },
  { id: "a1", ts: "02 Jul 2026 · 09:38", who: "Omar Bakri", what: "Account deactivated", detail: "Mei Tanaka · PM · left the firm" },
];
