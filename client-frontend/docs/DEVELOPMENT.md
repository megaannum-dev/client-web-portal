# Client Frontend — Development Guide

> **Project:** Megaanuum Client Portal — investor self-service interface for viewing, receiving notification, and upload documents when necessary.

> **Stack:** Next.js 14 · TypeScript · Tailwind CSS · Firebase Auth · FastAPI backend
> **Last updated:** 2026-05-20

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Architecture Overview](#architecture-overview)
4. [Auth Flow](#auth-flow)
5. [Pages & Features](#pages--features)
6. [Mock Data Layer](#mock-data-layer)
7. [Design System](#design-system)
8. [Environment Variables](#environment-variables)
9. [Current Status](#current-status)
10. [Next Steps](#next-steps)

---

## Quick Start

**Prerequisites:** Node.js 18+, and the `api-backend` running (see root `docker-compose.yml`).

```bash
# Install dependencies
npm install

# Start dev server (port 3000)
npm run dev
```



For the login authentication to work, you have to go to the `api-backend` repository to start docker compose:

```bash
docker compose up -d
```
* Note: The backend API defaults to `http://localhost:8000`.
---

## Project Structure

```
client-frontend/
├── app/
│   ├── layout.tsx              # Root layout — wraps everything in AuthProvider
│   ├── page.tsx                # Redirects / → /overview
│   ├── login/page.tsx          # Login page (email/password + Google)
│   ├── register/page.tsx       # Registration page
│   └── (dashboard)/            # Route group — all pages behind auth
│       ├── layout.tsx          # Dashboard layout — AuthGuard + MockStoreInit + DashboardShell
│       ├── overview/page.tsx
│       ├── portfolio/page.tsx
│       ├── documents/page.tsx
│       ├── events/page.tsx
│       ├── profile/page.tsx
│       ├── settings/page.tsx
│       └── support/page.tsx
├── components/
│   ├── auth/
│   │   ├── AuthProvider.tsx    # Firebase auth context + backend sync
│   │   └── AuthGuard.tsx       # Redirects unauthenticated users to /login
│   ├── sidebar/                # Sidebar, nav items, footer, logo
│   ├── header/                 # Header bar, search, action buttons
│   ├── ui/                     # Shared primitives: StatCard, PageHeader, SectionCard, EyeToggle, skeleton
│   ├── DashboardShell.tsx      # Sidebar + Header + main content layout
│   ├── KycProvider.tsx         # KYC status context (currently reads from localStorage mock)
│   └── MockStoreInit.tsx       # Seeds localStorage with mock data on first load
├── lib/
│   ├── firebase.ts             # Firebase app init + isFirebaseConfigured()
│   ├── auth-api.ts             # Backend auth endpoints: /register, /login, /logout
│   ├── firebase-auth-errors.ts # Human-readable Firebase error messages
│   ├── mock/data.ts            # All mock data constants
│   ├── hooks/                  # Custom hooks (useLatestEvents, useAllotmentRequests, …)
│   ├── icons.ts                # Re-exports from lucide-react
│   ├── levelConfig.ts          # Event severity → badge/icon/color mapping
│   └── downloadFile.ts         # Utility: trigger browser file download
└── types/
    └── portal.ts               # PortalUser type
```

---

## Architecture Overview

```
Browser
  └─ AuthProvider (Firebase onAuthStateChanged)
       ├─ Not authenticated → /login
       └─ Authenticated
            ├─ Firebase ID token → POST /api/auth/login (backend sync)
            └─ portalUser populated → dashboard routes accessible

Dashboard routes (/(dashboard)/*)
  └─ AuthGuard        — blocks unauthenticated access, shows spinner
  └─ MockStoreInit    — seeds localStorage with mock data (runs once per session)
  └─ DashboardShell   — renders Sidebar + Header + page content
```

The frontend talks to the backend exclusively through the Firebase ID token. On every sign-in, `AuthProvider` calls `POST /api/auth/login` with the token, which the backend verifies and returns a `PortalUser` (id, firebase_uid, email, role).

All dashboard data is currently **mocked** — no pages call the backend for business data yet.

---

## Pages & Features

| Route | Page | Status |
|---|---|---|
| `/login` | Login (email/password + Google) | ✅ Functional |
| `/register` | New account registration | ✅ Functional |
| `/overview` | Dashboard home — portfolio stats, recent requests, EOM reports, events | ✅ UI complete, all data mocked |
| `/portfolio` | Holdings breakdown, allotment/redemption request forms | ✅ UI complete, all data mocked |
| `/documents` | Document archive / download | ✅ UI complete, all data mocked |
| `/events` | Event log / notifications | ✅ UI complete, all data mocked |
| `/profile` | User profile view/edit | ✅ UI complete, all data mocked |
| `/settings` | Account settings | ✅ UI complete, all data mocked |
| `/support` | Support / contact | ✅ UI complete, all data mocked |

### Notable UI Patterns

- **EyeToggle** — privacy mode that masks financial figures behind `********`. Sits on the Overview page's Account Summary section.
- **StatCard** — reusable metric card with label, primary value, and a sub-line (trend or action).
- **SectionCard** — titled card wrapper used across all dashboard pages.
- **Skeleton loaders** — each page has a paired `loading.tsx` with placeholder skeletons.
- **Status badges** — `badge-caution`, `badge-success` utility classes driven by Tailwind.

---

## Mock Data Layer

All business data lives in [`lib/mock/data.ts`](lib/mock/data.ts). On first dashboard load, `MockStoreInit` seeds `localStorage` with:

| Key | Contents |
|---|---|
| `kycStatus` | KYC approval state string |
| `latestEvents` | Array of event objects with level, title, description, href |
| `allotmentRequests` | Array of submitted allotment requests (starts empty) |
| `eventItems` | Array of calendar/event items (starts empty) |

Pages read from these keys via custom hooks (`useLatestEvents`, `useAllotmentRequests`). This makes the mock stateful within a browser session — submitting a request through the UI persists to localStorage and reflects back in the overview table.

**To replace with real API calls:** 

**Purge** all of the custom hooks and the mock data directory from the codebase; they are only for demonstrating the usage logic / flow. Later on develop new hooks from scratch to tailer backend interaction would be much more appropriate.

---

## Design System

Tailwind config defines the token set. Key colors:

| Token | Value | Usage |
|---|---|---|
| `primary` | `#ec721a` (orange) | Buttons, links, highlights, brand accent |
| `corporate` / `secondary` | `#5f5f5f` (gray) | Secondary text, icons |
| `corporate-muted` | `#dadada` | Borders, dividers |
| `surface` | Background base | Page background |
| `surface-lowest` | Slightly lighter | Card backgrounds |
| `surface-container` | Slightly darker | Table headers, input backgrounds |
| `on-surface` | Dark text | Primary body text |

**Typography:** Hanken Grotesk (Google Fonts) — weights 400, 600, 700.

**Icons:** `lucide-react` — imported via [`lib/icons.ts`](lib/icons.ts) for consistent re-exports.

---

## Environment Variables

The following environmental variables must be set when running the frontend in order for the authentication part to run properly:
| Variable |
|---|
| `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |

For local development, a `.env.local` file is prepared to point at the specific Firebase project which this frontend application lives. Contact the project handler to provide the `.env.local`

## Current Status

**What's done:**
- Full authentication flow (Firebase email/password + Google, backend sync, auto sign-out on 401/403)
- All 7 dashboard pages built out with complete UI
- Stateful mock layer (localStorage) that lets the UI feel interactive without a real backend
- Reusable component library (StatCard, SectionCard, PageHeader, EyeToggle, skeleton loaders)
- KYC status context plumbed through the app

**What's not done (known gaps):**
- **Zero real data integration** — every page reads from `lib/mock/data.ts` or localStorage. No page calls the backend for business data.
- `KycProvider` reads KYC status from localStorage mock, not from a dedicated endpoint.
- The "Forgot password" and "Privacy Policy" / "Terms of Service" links on the login page are unimplemented routes.
- `rememberMe` checkbox on login is wired to state but has no effect on Firebase session persistence.
- Report downloads serve a single static dummy PDF (`/dummy-EoM-Report.pdf`) regardless of which report is selected.

---

## Next Steps

### Stakeholder Feedback — 2026-05-20 (Wilson)

UI changes requested before backend integration begins:

| Page | Feedback |
|---|---|
| **Overview** | Help tooltip should show RM's contact details and email — no internal messaging channel needed |
| **Overview** | Consider adding a company introduction and news section |
| **Portfolio** | Remove client-initiated allotment/redemption request flow — clients contact their RM directly |
| **Portfolio** | Display model limits and associated IB account per holding |
| **Documents** | Promote legal documents (Terms of Service, Contracts/Agreements) to the top of the page |
| **Profile** | Expand document upload section to support more types — KYC questionnaire upload as a minimum |
| **Settings** | Remove the bank account section |

---

### Backend Integration Architecture

Once UI changes above are complete, the data integration layer should be built following the same conventions as the internal Megaannum-Frontend repository. The pattern is a three-tier chain:

```
page.tsx / client component
    ↓ calls
actions.ts  ("use server" — error wrapping, logging)
    ↓ calls
server/[feature]/index.ts  ("use server" — API logic)
    ↓ calls
server/api-client.ts  (generic fetch wrapper + endpoint registry)
    ↓
FastAPI backend
```

#### Directory structure to build

```
├── app/(dashboard)/
│   ├── overview/
│   │   ├── page.tsx
│   │   └── actions.ts        # "use server" — wraps server functions, handles errors
│   ├── portfolio/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── documents/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── profile/
│   │   ├── page.tsx
│   │   └── actions.ts
│   └── ...
│
├── server/                   # All server-side API logic lives here (top-level, not inside pages)
│   ├── api-client.ts         # Core: generic apiClient<T>() with endpoint registry and error handling
│   ├── auth/                 # Auth server functions (login, logout, token refresh)
│   ├── overview/             # Overview data fetching
│   ├── portfolio/            # Portfolio / holdings data fetching
│   ├── documents/            # Document listing and upload
│   ├── profile/              # User profile and KYC
│   └── events/               # Events / notifications
│
├── hooks/
│   └── api/                  # Client-side data fetching hooks (call actions.ts, manage state)
│       ├── useOverviewSummary.ts
│       ├── usePortfolio.ts
│       ├── useDocuments.ts
│       ├── useEvents.ts
│       └── useProfile.ts
│
└── types/                    # TypeScript types, mirroring the server/ feature structure
    ├── overview/
    ├── portfolio/
    ├── documents/
    └── auth/
```

#### Role of each layer

**`server/api-client.ts`** — the only place that constructs HTTP requests. Holds the `ENDPOINTS` registry (all API URL constants), attaches the Firebase ID token from cookies, handles 401 auto-logout, and returns a typed `APIResult<T>` union (`{ success: true; data: T } | { success: false; error: string }`). No other file should call `fetch()` directly against the backend.

**`server/[feature]/index.ts`** — one folder per feature, marked `"use server"`. Calls `apiClient<T>()` with the relevant endpoint and returns the raw `APIResult<T>`. No error wrapping here — that is the action's job.

**`app/(dashboard)/[page]/actions.ts`** — also `"use server"`. Imports from `server/[feature]/`, wraps in try/catch, logs, and returns a result the client can consume. This is the boundary between the server and client worlds.

**`hooks/api/use*.ts`** — client-side hooks. Call the page's `actions.ts` functions, manage `useState`/`useEffect`, and return `{ data, loading, error }`. Components never call actions directly.

> **Purge point:** Once real hooks are in place, delete `lib/mock/`, `components/MockStoreInit.tsx`, and all localStorage read/write logic from the existing hooks. The mock layer exists only to demonstrate UI flow — it is not a migration target.
