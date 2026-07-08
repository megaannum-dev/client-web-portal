// admin-frontend/lib/pages.check.ts — run: `npx tsx admin-frontend/lib/pages.check.ts`
// One assert per D-7/B-1 invariant. No test framework.
import { strict as assert } from "node:assert";
import {
  PAGES, ROLE_PAGES, accessLevel, pagesForRole, defaultPathFor, rolesForPath, groupsFor,
} from "./pages";

// D-7: default-deny for unrecognized roles.
for (const bogus of ["BOGUS", "", "admin" /* case matters */, "undefined"]) {
  assert.deepEqual(pagesForRole(bogus), [], `pagesForRole(${JSON.stringify(bogus)}) must be []`);
  assert.equal(accessLevel(bogus, "pc.model-management"), null);
  assert.equal(defaultPathFor(bogus), null);
}

// D-7: ADMIN's all-pages set is reachable only via the literal key.
assert.equal(pagesForRole("ADMIN").length, Object.keys(PAGES).length, "ADMIN grants every PageId");
assert.ok(pagesForRole("ADMIN").every((id) => ROLE_PAGES.ADMIN[id] === "OPERATE"), "ADMIN grants are all OPERATE");

// B-1: no page under a namespace resolves to a role that isn't in ROLE_PAGES.
for (const p of Object.values(PAGES)) {
  const roles = rolesForPath(p.path);
  assert.ok(roles.every((r) => r in ROLE_PAGES), `rolesForPath(${p.path}) yielded unknown role`);
}

// Parity with pre-refactor: each existing namespace resolves to exactly today's role set.
assert.deepEqual(rolesForPath("/mobo/recon-overview").sort(),          ["ADMIN", "MOBO"].sort());
assert.deepEqual(rolesForPath("/rm/onboarding-renewal").sort(),        ["ADMIN", "RM"].sort());
assert.deepEqual(rolesForPath("/rm/client-info").sort(),               ["ADMIN", "RM"].sort());
assert.deepEqual(rolesForPath("/rm/client-detail").sort(),             ["ADMIN", "RM"].sort());
assert.deepEqual(rolesForPath("/pc/allocation-matrix").sort(),         ["ADMIN", "PC"].sort());
assert.deepEqual(rolesForPath("/monthly-reports").sort(),              ["ADMIN", "MOBO", "PC", "RM"].sort());
assert.deepEqual(rolesForPath("/admin/enroll-user"),                   ["ADMIN"]);

// Every page has a non-empty default name (its own label + icon) — used for breadcrumbs, dropdown children, titles.
for (const p of Object.values(PAGES)) {
  assert.ok(p.label && p.icon, `${p.id} missing label/icon`);
}

// Nav grouping: role's groups match its granted pages, deduped by home.
assert.deepEqual(groupsFor(pagesForRole("PC")).map((g) => g.home),     ["/pc/model-management"]);
assert.equal(groupsFor(pagesForRole("ADMIN")).length,                  4 /* RM, MOBO, PC, Admin */);

// Default landing page ↔ nav-group home coherence.
for (const role of ["RM", "MOBO", "PC", "ADMIN"] as const) {
  const dp = defaultPathFor(role);
  assert.ok(dp && rolesForPath(dp).includes(role), `${role}'s default page must be a page it can reach`);
}

console.log("pages.check.ts: OK");
