# Temporary SilverWater Public Site — User Story

**Date:** 2026-10-12
**Status:** Implemented (temporary, review ~2026-11-06)
**Implemented in:** website PR [jfung2019/am-megaannum-company-website#6](https://github.com/jfung2019/am-megaannum-company-website/pull/6) and this repo's `Caddyfile`
**Builds on:** website PR #5 (temporary SilverWater branding)

---

## User story

**As** the firm's management,
**I want** the public website to show only SilverWater-branded content for now, served on `silverwater-cm.com`, with `megaannum-am.com` no longer serving the public site,
**so that** visitors do not see the Board of Directors / team section or the Megaannum-branded site while the SilverWater branding is in use, and the page still looks deliberate.

## Acceptance criteria

1. The team section (board of directors and portfolio team) is not rendered on the home page.
2. The "Our Team" link is absent from the desktop and mobile navigation.
3. Section background colours still alternate with no two adjacent sections in the same colour: Platform (orange), Contact (white), Footer (navy, no orange border).
4. `megaannum-am.com` and `www.megaannum-am.com` no longer serve the public site; they forward to `https://silverwater-cm.com` (domain forwarding in Hostinger).
5. The `crm`, `clientportal`, `api` and `cms` subdomains are unaffected.
6. Everything is reversible without code archaeology: setting `SILVERWATER_TEMP = false` in the website restores the team section and Megaannum branding, and uncommenting the two Caddy blocks (and removing the Hostinger forwarding) restores `megaannum-am.com`.

## Implementation notes

- **Website:** the team section, its nav links and the Megaannum-only elements are gated on `SILVERWATER_TEMP` (`src/lib/temp-branding.ts`). Contact is white and the footer border is removed so the colours still alternate.
- **Caddy:** the `megaannum-am.com` and `www.megaannum-am.com` site blocks are commented out in `Caddyfile`, with a note on how to restore them.
- **Housekeeping in the same website PR:** each section's files now live in one folder; `OurPeopleSection` is `TeamSection`.

## Out of scope

- Deleting any team content or CMS data.
- Changes to the client portal, CRM or API hosts.
