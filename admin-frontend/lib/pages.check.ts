// admin-frontend/lib/pages.check.ts — run: `npx tsx admin-frontend/lib/pages.check.ts`
// Plain node:assert. NOT a Vitest suite — kept in that form deliberately.
import { strict as assert } from "node:assert";
import {
  PAGES, ROLE_DEFAULT_PAGE, defaultPathFor, pageIdForPath, groupsFor,
  type GrantMap, type PageId,
} from "./pages-config";
import { ALL_PAGES, PAGE_GROUPS, TOTAL_PAGES, kFor } from "./admin/catalog";
import type { MatrixOut } from "../server/admin";

// A-1: the derived catalog and PAGES are the same set — the matrix can neither describe
// a page that does not exist nor fail to reach one that does.
assert.deepEqual(ALL_PAGES.map((p) => p.page_id).sort(), (Object.keys(PAGES) as PageId[]).sort());
assert.equal(TOTAL_PAGES, Object.keys(PAGES).length);
assert.equal(PAGE_GROUPS.flatMap(([, ps]) => ps).length, TOTAL_PAGES);   // no page in two groups

// A-1: the SERVER's page set must equal the local one. Asserted against a committed
// fixture of MatrixOut["pages"] at the foot of this file — this script makes NO network
// call. The live equality is §8's FE-7 goal plus the proposal's phase-5 smoke.
const MATRIX_PAGES_FIXTURE: MatrixOut["pages"] = [
  { page_id: "rm.client-info", group: "Client Management", label: "Client Information", path: "/rm/client-info" },
  { page_id: "rm.onboarding-renewal", group: "Client Management", label: "Onboarding & Renewal", path: "/rm/onboarding-renewal" },
  { page_id: "rm.model-subscription", group: "Client Management", label: "Model Subscription", path: "/rm/model-subscription" },
  { page_id: "rm.request-tickets", group: "Client Management", label: "Request Tickets", path: "/rm/requests" },
  { page_id: "mobo.recon-overview", group: "Other", label: "Reconciliation Overview", path: "/mobo/recon-overview" },
  { page_id: "mobo.trade-reconciliation", group: "Trade Management", label: "Trade Reconciliation", path: "/mobo/trade-reconciliation" },
  { page_id: "mobo.commission-tracking", group: "Trade Management", label: "Commission Tracking", path: "/mobo/commission-tracking" },
  { page_id: "mobo.post-trade-allocation", group: "Trade Management", label: "Post-Trade Allocation", path: "/mobo/post-trade-allocation" },
  { page_id: "pc.model-management", group: "System", label: "Model Management", path: "/pc/model-management" },
  { page_id: "pc.allocation-matrix", group: "Trade Management", label: "Allocation Matrix", path: "/pc/allocation-matrix" },
  { page_id: "pc.allotment-redemption", group: "Client Management", label: "Allotment & Redemption", path: "/pc/allotment-redemption" },
  { page_id: "compliance.overview", group: "Other", label: "Compliance Overview", path: "/compliance/overview" },
  { page_id: "compliance.review", group: "Compliance", label: "Compliance Review", path: "/compliance/review" },
  { page_id: "shared.monthly-reports", group: "Trade Management", label: "Monthly Reports (Models)", path: "/monthly-reports" },
  { page_id: "admin.enroll-user", group: "System", label: "Enroll User", path: "/admin/enroll-user" },
  { page_id: "admin.system-config", group: "System", label: "System Config", path: "/admin/system-config" },
];
assert.deepEqual(
  MATRIX_PAGES_FIXTURE.map((p) => p.page_id).sort(),
  (Object.keys(PAGES) as PageId[]).sort(),
  "server MatrixOut.pages and local PAGES must be the same set",
);

// D-7's default-deny, restated for the grant model: an empty grant map yields no nav.
assert.deepEqual(groupsFor({}, "ADMIN"), []);
assert.deepEqual(groupsFor({}, "BOGUS"), []);
for (const bogus of ["BOGUS", "", "admin" /* case matters */, "undefined"]) {
  assert.equal(defaultPathFor(bogus), null);
}

// Grant-driven nav: one parent per role, hideFromNav never listed, a NONE page absent.
const allEdit: GrantMap = Object.fromEntries(
  (Object.keys(PAGES) as PageId[]).map((id) => [id, "EDIT"]),
);
assert.equal(groupsFor(allEdit, "ADMIN").length, 1, "ADMIN must have exactly one nav group");
assert.ok(!groupsFor(allEdit, "ADMIN")[0].pages.some((p) => p.href === "/mobo/recon-overview"));
{
  const reduced: GrantMap = { ...allEdit };
  delete reduced["pc.allocation-matrix"];
  assert.ok(!groupsFor(reduced, "PC")[0].pages.some((p) => p.href === "/pc/allocation-matrix"));
}
assert.deepEqual(groupsFor(allEdit, "PM"), []);      // no ROLE_NAV entry → zero groups

// Path resolution — the surviving half of the old rolesForPath.
assert.equal(pageIdForPath("/rm/client-info"),           "rm.client-info");
assert.equal(pageIdForPath("/rm/client-info/some-uuid"), "rm.client-info");  // prefix rule (010 A-6/D-6)
assert.equal(pageIdForPath("/rm/requests/REQ-1"),        "rm.request-tickets");
assert.equal(pageIdForPath("/monthly-reports"),          "shared.monthly-reports");
assert.equal(pageIdForPath("/nope"),                     null);

// Every page has a default name; every role's default page is a real PageId.
for (const p of Object.values(PAGES)) assert.ok(p.label && p.icon, `${p.id} missing label/icon`);
for (const [role, id] of Object.entries(ROLE_DEFAULT_PAGE)) {
  if (id) assert.ok(id in PAGES, `${role}'s default page must be a known PageId`);
}

// Cell keys are role-code keyed and collision-free.
assert.equal(kFor("pc.allocation-matrix", "PC"), "pc.allocation-matrix|PC");
assert.notEqual(kFor("pc.allocation-matrix", "PC"), kFor("pc.allocation-matrix", "PM"));

console.log("pages.check.ts: OK");
