# Backend Requirements Proposal
## Client Web Portal — API Backend

> **Status:** Draft for review — v3 (three-database architecture confirmed)
> **Last updated:** 2026-05-21  
> **Author:** QinQipeng  

---

## Table of Contents

1. [What This Document Is](#1-what-this-document-is)
2. [Project Context](#2-project-context)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [User Roles](#4-user-roles)
5. [Use Case Summary (per Role)](#5-use-case-summary-per-role)
6. [Feature Modules](#6-feature-modules)
   - [Module 1 — Authentication & User Management](#module-1--authentication--user-management)
   - [Module 2 — Client Onboarding & KYC/AML](#module-2--client-onboarding--kyc--aml)
   - [Module 3 — Trading Models (Model Information Table)](#module-3--trading-models-model-information-table)
   - [Module 4 — Pre-Trade Check & Allocation](#module-4--pre-trade-check--allocation)
   - [Module 5 — Allotment & Redemption Processing](#module-5--allotment--redemption-processing)
   - [Module 6 — Model Client Assignment Record](#module-6--model-client-assignment-record)
   - [Module 7 — Reporting (EOD, EOM, Risk)](#module-7--reporting-eod-eom-risk)
   - [Module 8 — Role & Feature Configuration (ADMIN)](#module-8--role--feature-configuration-admin)
   - [Module 9 — KYC / AML Document Audit](#module-9--kyc--aml-document-audit)
   - [Module 10 — IB API Integration (Placeholder)](#module-10--ib-api-integration-placeholder)
7. [Permission Matrix](#7-permission-matrix)
8. [Authentication and Authorization Design](#8-authentication-and-authorization-design)
9. [Data Architecture](#9-data-architecture)
10. [Recommended Project Structure](#10-recommended-project-structure)
11. [Extensibility Principles](#11-extensibility-principles)
12. [Open Questions and TBD Items](#12-open-questions-and-tbd-items)

---

## 1. What This Document Is

This is a **requirements proposal** for advancing the existing skeleton backend into a maintainable, modular, production-ready API. It is written for a reader who may not have a software development background. Technical terms are explained where necessary.

This document defines:
- Who uses the system and what they are allowed to do
- What feature areas (modules) the backend must support
- How authentication and access control should be structured
- Recommendations on tools and technologies

This document does **not** define implementation code, database schema details, or exact API endpoint designs. Those are downstream deliverables.

### Revision history

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-05-21 | Initial draft |
| v2 | 2026-05-21 | Added Module 6 (Model Client Assignment Record); elevated Compliance Audit Log to Module 9; clarified data architecture from module diagram |
| v3 | 2026-05-21 | Switched to three physically separate databases: existing MariaDB (user accounts), PostgreSQL (business logic), MongoDB (IB data); updated project structure to reflect multi-database connections |

---

## 2. Project Context

### What the system is

The **Client Web Portal** is a fund management platform with two separate user-facing websites (called "portals"):

| Portal | Who uses it | Purpose |
|--------|-------------|---------|
| `client-frontend` | External investors (Clients) | View monthly reports, submit investment requests |
| `admin-frontend` | Internal staff | Manage trades, clients, compliance, and reporting |

Both portals talk to a single shared **backend API** — the service this document is about.

### What already exists (the skeleton)

The current skeleton backend is built with **Python + FastAPI** and uses **Firebase Authentication**. It already supports:
- User registration and login via Firebase (Google's authentication service)
- A `users` table in a database storing each user's role
- Basic role-checking on individual API routes
- Two stub feature routes: allotment and redemption (placeholder business logic)

### What this project is NOT

This backend is an **entirely independent project** from the existing `Megaannum-ClientData-API`. It does not share databases, code, or infrastructure with that system. The only anticipated external financial data source is the **Interactive Brokers (IB) API**, the integration of which is out of scope for this phase (see [Module 10](#module-10--ib-api-integration-placeholder)).

---

## 3. Goals and Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | Define and implement all business roles, each with clearly scoped permissions |
| G2 | Build a modular project structure where each feature area is self-contained and easy to extend |
| G3 | Enforce role-based access control (RBAC) consistently across all API routes |
| G4 | Allow an ADMIN user to configure which features are available to which roles at runtime |
| G5 | Record a tamper-evident audit log for all compliance-sensitive actions |
| G6 | Provide a clearly marked placeholder module for IB API integration |
| G7 | Produce a codebase that a new developer can understand and extend without knowing the full history |

### Non-Goals (out of scope for this proposal)

| # | Non-Goal | Note |
|---|----------|------|
| N1 | Interactive Brokers API integration | Marked as a TODO module; implementation is TBD |
| N2 | Full UI/frontend design | Covered separately by the frontend teams |
| N3 | Migration from the Megaannum-ClientData-API | These are independent systems |
| N4 | Specific report content and calculations | Business logic is TBD per feature module |
| N5 | Deployment and infrastructure setup | Out of scope for this backend requirements phase |

---

## 4. User Roles

The system has **eight roles**. One is external (client-facing); seven are internal (staff-facing). Roles are assigned by an ADMIN after a user registers. New users default to CLIENT unless registering through the admin portal.

### External Role

| Role | Display Name | Portal |
|------|-------------|--------|
| `CLIENT` | External Investor / Client | `client-frontend` |

### Internal Roles

| Role | Display Name | Portal | Real-world analogy |
|------|-------------|--------|-------------------|
| `ADMIN` | System Administrator | `admin-frontend` | Super-user; configures access for all other roles |
| `PC` | Portfolio Commander | `admin-frontend` | Senior portfolio authority; owns trading models and pre-trade sign-off |
| `PM` | Portfolio Manager | `admin-frontend` | Manages individual portfolios and executes client instructions |
| `COMPLIANCE` | Chief Compliance Officer | `admin-frontend` | Oversees regulatory requirements; approves pre-trade and KYC/AML |
| `RISK` | Risk Leader / Risk Management | `admin-frontend` | Monitors post-trade risk exposure |
| `RM` | Relationship Manager / Sales | `admin-frontend` | Manages client relationships, onboarding, and KYC documentation |
| `MOBO` | Mid/Back Office | `admin-frontend` | Operational support; post-trade processing and reporting |

> **Note on ADMIN authority:** The ADMIN role has access to every feature in the system and is the only role that can change another user's role or toggle feature access for other roles. ADMIN is a system-level role, not a business function. It replaces the former `OPS` role, which is removed.

---

## 5. Use Case Summary (per Role)

The following is derived from the UML use case diagram (`Megannum CRM UML Diagrams.pdf`, page 1). Each use case corresponds to a feature module defined in [Section 6](#6-feature-modules).

### CLIENT
| Use Case | Module |
|----------|--------|
| View EOM Report | Module 7 |
| Submit Compliance Documents (KYC / AML) for Renewal | Module 2 |

### RISK
| Use Case | Module |
|----------|--------|
| Monitor Post-trade Risk Report | Module 7 |
| View EOD Report | Module 7 |
| View EOM Report | Module 7 |

### COMPLIANCE
| Use Case | Module |
|----------|--------|
| Review and Sign Pre-Trade Allocation | Module 4 |
| Approve & Execute Allotment / Redemption | Module 5 |
| View EOD Report | Module 7 |
| View EOM Report | Module 7 |
| Receive and Approve KYC / AML Documents | Module 2, Module 9 |

### PC (Portfolio Commander)
| Use Case | Module |
|----------|--------|
| Portfolio & Exposure Limits Report | Module 4 |
| Create and Manage Trading Models | Module 3 |
| Review and Sign Pre-Trade Allocation | Module 4 |
| Monitor Model Client Assignment | Module 6 |
| Approve & Execute Allotment / Redemption | Module 5 |
| View EOD Report | Module 7 |
| View EOM Report | Module 7 |

### PM (Portfolio Manager)
| Use Case | Module |
|----------|--------|
| Portfolio & Exposure Limits Report | Module 4 |
| Monitor Model Client Assignment | Module 6 |
| Approve & Execute Allotment / Redemption | Module 5 |
| View EOD Report | Module 7 |

### MOBO
| Use Case | Module |
|----------|--------|
| View EOD Report | Module 7 |
| View EOM Report | Module 7 |

### RM
| Use Case | Module |
|----------|--------|
| Onboard New Client | Module 2 |
| View and Update Client Profile | Module 2 |
| Upload and Renew KYC / AML Documents | Module 2, Module 9 |
| Receive and Approve KYC / AML Documents (level 1) | Module 2, Module 9 |

### ADMIN
| Use Case | Module |
|----------|--------|
| All of the above | All modules |
| Manage Users | Module 1 |
| Configure Role Permissions | Module 8 |

---

## 6. Feature Modules

The backend is organized into **ten self-contained feature modules**. Each module has its own routes, business logic, and database models — making it easy to add, modify, or disable independently.

> **Module diagram source:** The ten modules below were consolidated from two sources: the UML use case diagram and the CRM Platform Module Diagram. The cross-reference is documented at the end of this section.

---

### Module 1 — Authentication & User Management

**Purpose:** Manage user identity, registration, login, and role assignment.

| Feature | Description |
|---------|-------------|
| Firebase-based registration | New users register via the frontend; Firebase verifies identity; backend stores the user record |
| Login / session verification | Every API request carries a Firebase token; the backend validates it on every call |
| Role assignment | ADMIN can change any user's role via an admin endpoint |
| User profile | Users can view and update their own profile (name, email) |
| User listing | ADMIN can list, search, and deactivate users |

**Already partially implemented in the skeleton.** This module requires extension to support all 8 roles.

---

### Module 2 — Client Onboarding & KYC / AML

**Purpose:** Allow RM to register new clients and manage identity verification documents. Route COMPLIANCE through an approval workflow.

**Corresponds to diagram blocks:** *Client Onboarding (includes KYC)*, *Client Profile Display & Edit*

| Feature | Description |
|---------|-------------|
| Create client record | RM creates a new CLIENT user entry and associated profile |
| Client profile management | RM views and updates client personal/investment profile data |
| Document upload | RM uploads KYC / AML documents (e.g., passport, proof of address) on behalf of the client when onboarding |
| Document review — level 1 | RM performs first-level review of submitted documents |
| Document review — final approval | COMPLIANCE performs final approval or rejection |
| Document renewal | Client can submit renewed documents when existing ones expire |

> Approval and rejection actions in this module are recorded in **Module 9 (KYC/AML Document Audit)**.

**Status of specific fields, document types, and workflow states:** TBD.

---

### Module 3 — Trading Models (Model Information Table)

**Purpose:** Allow PC to define and maintain the trading model table used to determine how assets are allocated across client portfolios.

**Corresponds to diagram block:** *Model Information Table*

| Feature | Description |
|---------|-------------|
| Create trading model | PC creates a new model entry with its parameters |
| Update trading model | PC edits existing model parameters |
| Deactivate trading model | PC marks a model as inactive (does not delete history) |
| View trading models | PC, PM, COMPLIANCE can view the model information table |

**PC has exclusive write access.** PM and COMPLIANCE have read-only access.

**Specific model fields and parameters:** TBD.

---

### Module 4 — Pre-Trade Check & Allocation

**Purpose:** Support the pre-trade workflow: portfolio exposure review, allocation matrix authoring, and co-sign by PC and COMPLIANCE.

**Corresponds to diagram blocks:** *Portfolio & Exposure Limits Report*, *Pre Trade Allocation*

| Feature | Description |
|---------|-------------|
| Portfolio & Exposure Limits Report | Display pre-trade portfolio exposure against defined risk limits; accessible to PC, PM, COMPLIANCE |
| Create Pre-Trade Allocation Matrix | PC authors the proposed allocation plan for a given trading cycle |
| Review and Sign — PC | PC signs the matrix they authored (mandatory) |
| Review and Sign — COMPLIANCE | COMPLIANCE co-signs the matrix (mandatory before execution proceeds) |
| Allocation status tracking | Matrix moves through states (e.g., Draft → Signed by PC → Signed by Compliance → Approved) |

> Sign-off actions in this module are recorded in **Module 9 (KYC/AML Document Audit)** under compliance events.

**PC authors and must sign; COMPLIANCE must co-sign before any trading proceeds.** PM is read-only on the exposure report.

**Specific exposure limit rules, sign-off state machine, and rejection flow:** TBD.

---

### Module 5 — Allotment & Redemption Processing

**Purpose:** Handle client investment (allotment) and withdrawal (redemption) requests through a lifecycle from submission to execution.

**Corresponds to diagram block:** (existing skeleton stubs; covered implicitly in use case diagram under "Approve & Execute Allotment and Redemption requests")

| Feature | Description |
|---------|-------------|
| Submit allotment request | CLIENT submits a subscription/investment request |
| Submit redemption request | CLIENT submits a withdrawal request |
| View pending requests | PC, PM, COMPLIANCE can view pending requests |
| Approve request | PC, PM, or COMPLIANCE approve a request |
| Execute request | An approved request is marked as executed, which **triggers an update to Module 6** (Model Client Assignment) |
| Request status tracking | Requests move through defined lifecycle states |

> **Critical link to Module 6:** When an allotment request is approved and executed, it creates or updates the client's model assignment record in Module 6. When a redemption is executed, it reduces or removes that assignment. Module 5 is the *process*; Module 6 is the *resulting state*.

**Stub routes already exist in the skeleton.** This module replaces and extends those stubs.

**Specific lifecycle states, rejection reasons, and execution triggers:** TBD.

---

### Module 6 — Model Client Assignment Record

**Purpose:** Maintain the live, authoritative record of which trading models are currently assigned to each client — the actual portfolio composition as it stands today.

**Corresponds to diagram block:** *Model Client Information Record*

> **Why this is a separate module from Module 5:**
> Module 5 handles *requests* (a client wants to subscribe or redeem). Those requests go through an approval workflow. Module 6 records the *outcome* — the actual models a client is invested in after approvals are executed. Think of Module 5 as a transaction log and Module 6 as a bank balance ledger.

| Feature | Description |
|---------|-------------|
| Client model assignment record | For each client, store which trading model(s) they are currently assigned to, and in what proportion |
| Assignment created/updated automatically | When a allotment request is executed (Module 5), the system writes or updates the assignment here — not directly by users |
| Assignment reduced/removed automatically | When a redemption is executed (Module 5), the system reduces or removes the assignment here |
| View assignments | PC, PM, and COMPLIANCE can view the current model assignments for all or individual clients |

**No user directly writes to this module.** It is updated only as a side effect of executed allotment/redemption requests in Module 5. This protects the integrity of the ledger.

**Specific fields (allocation percentage, unit quantity, effective date, etc.):** TBD.

---

### Module 7 — Reporting (EOD, EOM, Risk)

**Purpose:** Provide role-appropriate reports to internal staff and external clients.

**Corresponds to diagram blocks:** *EOD & EOM Report Generation*, *Post-trade Risk Report*

| Report | Description | Who can access |
|--------|-------------|----------------|
| EOM Report (End of Month) | Monthly portfolio/statement report delivered to the external client | CLIENT |
| EOD Report (End of Day) | Internal post-trade summary for operational review after each trading day | PC, PM, COMPLIANCE, MOBO |
| Post-Trade Risk Report | Risk exposure table generated after trade execution, used for risk monitoring | RISK |

> Report data for EOD and EOM reports is expected to eventually be sourced from the Interactive Brokers (IB) API (see Module 10). Until that integration is complete, these endpoints return stub or manually-entered data.

**Report content, data sources, calculation logic, and generation schedule:** TBD.

---

### Module 8 — Role & Feature Configuration (ADMIN)

**Purpose:** Allow ADMIN to control which features are accessible to which roles without deploying code changes.

| Feature | Description |
|---------|-------------|
| Feature flag table | A database table that stores which features are enabled per role |
| Toggle feature access | ADMIN can enable or disable a feature for a given role via an API call |
| View current permissions | ADMIN can query the current permission configuration |

> **Two layers of access control exist:**
> 1. **Hard-coded route guards** — developer-defined rules that cannot be changed at runtime (e.g., only ADMIN can change user roles — ever).
> 2. **Configurable feature flags** — ADMIN-controlled toggles stored in the database for business-level features (e.g., whether PM can view the risk report).
>
> The hard-coded layer is the security floor. The configurable layer sits on top for business flexibility.

---

### Module 9 — KYC / AML Document Audit

**Purpose:** Record a tamper-evident, append-only log of all compliance-sensitive actions across the system. This module is driven by regulatory requirements — it exists to prove that the right people approved the right things at the right time.

**Corresponds to diagram block:** *KYC / AML Document Audit*

> This module was previously described in passing as a "design principle" in earlier drafts. Based on the module diagram, it is a **first-class module** with its own dedicated data records, not a side feature of other modules. Other modules write into this audit log; no module reads back from it in normal operation (it is for audit/export, not for driving business logic).

#### Events recorded

| Event | Triggered from | Logged fields |
|-------|---------------|---------------|
| KYC/AML document submitted | Module 2 | actor (RM), client ID, document ID, timestamp |
| KYC/AML document approved — level 1 | Module 2 | actor (RM), client ID, document ID, decision, timestamp |
| KYC/AML document approved — final | Module 2 | actor (COMPLIANCE), client ID, document ID, decision, timestamp |
| KYC/AML document rejected | Module 2 | actor, client ID, document ID, rejection reason, timestamp |
| Pre-trade allocation signed by PC | Module 4 | actor (PC), allocation matrix ID, timestamp |
| Pre-trade allocation signed by COMPLIANCE | Module 4 | actor (COMPLIANCE), allocation matrix ID, timestamp |
| Allotment request approved | Module 5 | actor, request ID, client ID, decision, timestamp |
| Allotment request executed | Module 5 | actor, request ID, client ID, timestamp |
| Redemption request approved | Module 5 | actor, request ID, client ID, decision, timestamp |
| Redemption request executed | Module 5 | actor, request ID, client ID, timestamp |

#### Design principles for this module

- **Append-only:** Records are never updated or deleted by the application under any circumstance
- **Separate table:** Stored in its own `compliance_audit_log` table, not mixed with operational data
- **Written at the service layer:** The audit write is part of the business logic function, not an afterthought
- **Not a general activity log:** Login events, read-only views, and non-compliance actions are not recorded here

**Retention period, export format (e.g., CSV for regulators), and who can view audit records:** TBD.

---

### Module 10 — IB API Integration (Placeholder)

**Purpose:** Placeholder module for future integration with the Interactive Brokers (IB) API, the primary source of real financial data (portfolio positions, trade execution, market data).

**Corresponds to diagram block:** *Interactive Brokers (IB) Database*

> The diagram labels this as "IB Database." This is conceptually accurate — IB holds the financial data. However, we access it as an **external API**, not a database we connect to directly. We do not own, manage, or replicate the IB database.

| Feature | Description |
|---------|-------------|
| Stub module | All IB-dependent functions exist as stubs that return `501 Not Implemented` |
| Defined interfaces | Function signatures are defined so other modules can call them; real implementation is a drop-in replacement |
| Clear labeling | Every stub is annotated with a `TODO(IB-API)` tag and a reference to this document section |

**Dependencies before implementation can begin:**
- IB API product selection (Client Portal API, TWS API, or IBKR FIX)
- Access credentials and environment (paper trading vs. live)
- Field-level data mapping: which IB data fields map to which reports

---

## 7. Permission Matrix

The table below summarizes what each role can do per module. **R** = Read, **W** = Write/Create/Update, **A** = Approve/Sign, **—** = No access.

| Feature | CLIENT | RISK | COMPLIANCE | PC | PM | MOBO | RM | ADMIN |
|---------|--------|------|------------|----|----|------|----|-------|
| **M1: own profile** | R/W | R/W | R/W | R/W | R/W | R/W | R/W | R/W |
| **M1: manage all users** | — | — | — | — | — | — | — | R/W |
| **M2: create client record** | — | — | — | — | — | — | W | W |
| **M2: view/update client profile** | — | — | — | — | — | — | R/W | R/W |
| **M2: upload KYC/AML docs** | W | — | — | — | — | — | W | W |
| **M2: review KYC/AML docs (level 1)** | — | — | — | — | — | — | A | A |
| **M2: approve KYC/AML docs (final)** | — | — | A | — | — | — | — | A |
| **M3: view trading models** | — | — | R | R | R | — | — | R |
| **M3: create/manage trading models** | — | — | — | R/W | — | — | — | R/W |
| **M4: portfolio & exposure limits report** | — | — | R | R | R | — | — | R |
| **M4: create pre-trade allocation matrix** | — | — | — | W | — | — | — | W |
| **M4: sign allocation — PC** | — | — | — | A | — | — | — | A |
| **M4: sign allocation — COMPLIANCE** | — | — | A | — | — | — | — | A |
| **M5: submit allotment request** | — | — | — | — | — | — | — | W |
| **M5: submit redemption request** | — | — | — | — | — | — | — | W |
| **M5: view pending requests** | — | — | R | R | R | — | — | R |
| **M5: approve/execute requests** | — | — | A | A | A | — | — | A |
| **M6: view model client assignments** | — | — | R | R | R | — | — | R |
| **M6: write model client assignments** | — | — | — | — | — | — | — | — |
| **M7: EOD Report** | — | R | R | R | R | R | — | R |
| **M7: EOM Report** | R | R | R | R | — | R | — | R |
| **M7: Post-trade Risk Report** | — | R | — | — | — | — | — | R |
| **M8: view/configure feature flags** | — | — | — | — | — | — | — | R/W |
| **M9: audit log written automatically** | — | — | *(system)* | *(system)* | *(system)* | — | *(system)* | — |
| **M9: audit log viewable** | — | — | — | — | — | — | — | R |
| **M10: IB API (stub)** | — | — | — | — | — | — | — | — |

> **M6 write is system-only** — no human user role directly writes to the model client assignment record. It is updated automatically when Module 5 executes an approved allotment or redemption request.

> This matrix represents the **default configuration**. An ADMIN may adjust business-level feature access via Module 8. Hard-coded security rows (such as M1 user management and M8 feature flags) cannot be overridden by ADMIN configuration.

---

## 8. Authentication and Authorization Design

### How authentication works (plain language)

When a user opens the portal in their browser, they sign in with their email and password (or Google account) through **Firebase** — a third-party authentication service provided by Google. Firebase verifies the identity and issues a short-lived digital credential called an **ID token** (think of it as a temporary signed pass, valid for about an hour).

Every time the frontend makes a request to the backend API, it attaches this token to the request. The backend validates the token with Firebase on every single request. If the token is invalid or expired, the request is rejected immediately.

Once the token is validated, the backend looks up the user in its own database to retrieve their assigned role, then checks whether that role is permitted to perform the requested action.

### Three-layer access control

```
Incoming request
     │
     ▼
[Layer 1] Firebase token validation
     │  Invalid or expired → 401 Unauthorized
     ▼
[Layer 2] Role check (hard-coded guard — cannot be overridden)
     │  Role not allowed → 403 Forbidden
     ▼
[Layer 3] Feature flag check (ADMIN-configurable via Module 8)
     │  Feature disabled for this role → 403 Forbidden
     ▼
Business logic executes
```

### Role assignment flow

```
New user registers
     │
     ▼
Backend creates user record with default role = CLIENT
     │
     ▼
ADMIN logs in and assigns the correct role to the user
     │
     ▼
User now has access to features permitted by their role
```

### Key rule: one user, one role

Each user has exactly one role at a time. A user cannot simultaneously be a PM and an RM. If a person's responsibilities change, an ADMIN updates their role.

### Development mode

The skeleton includes a bypass mode (`FIREBASE_AUTH_DISABLED=true`) where the backend accepts requests without a real Firebase token. This is only for local development and must **never** be enabled in production.

---

## 9. Data Architecture

### Three physically separate databases

The system uses three independent databases, each responsible for a distinct data domain. They do not share a server or connection. Each has a separate connection configured in the backend.

| Database | Technology | What it stores | Who set it up |
|----------|-----------|----------------|---------------|
| **User Account DB** | MariaDB (existing) | User records: display name, email, assigned role, account status | Already running — we connect to it |
| **Business Logic DB** | PostgreSQL (new) | All application data: client profiles, KYC documents, trading models, allocations, allotment/redemption requests, model client assignments, audit logs, feature flags | We build and manage this |
| **IB Data DB** | MongoDB (new) | Raw data fetched from the IB API: positions, trades, prices, account balances — stored as-is in document format | We build and manage this |

---

### Database 1 — User Account DB (MariaDB, existing)

**MariaDB** is the existing relational database that already stores user account records for this project.

**Role in the authentication flow:**

```
User logs in via the portal
     │
     ▼
Firebase verifies the user's identity and issues an ID token
     │
     ▼
Backend validates the token with Firebase on every request
     │
     ▼
Backend looks up the user's record in MariaDB
to retrieve their assigned role and account status
     │
     ▼
Role-based access control proceeds
```

Firebase handles *identity verification* (is this person who they say they are?). MariaDB holds the *application record* for that person (what role are they, are they active, what is their display name?). Both are required for a successful request.

**What this database stores for Module 1:**
- User ID (same as the Firebase UID — used as the link between the two systems)
- Display name, email
- Assigned role (`CLIENT`, `ADMIN`, `PC`, `PM`, `COMPLIANCE`, `RISK`, `RM`, `MOBO`)
- Account status (active / deactivated)
- Registration timestamp

**SQLAlchemy** (the database toolkit already used in the skeleton) supports MariaDB natively, as MariaDB is compatible with the MySQL driver. No additional library is needed.

---

### Database 2 — Business Logic DB (PostgreSQL, new)

**PostgreSQL** is the recommended database for all business application data.

| Reason | Explanation |
|--------|-------------|
| Structured data | Business records — client profiles, trading models, allotment requests, audit logs — have a predictable, fixed shape; relational databases handle this best |
| Production-ready | PostgreSQL is mature and widely trusted in financial applications |
| SQLAlchemy compatibility | Works with the same SQLAlchemy toolkit already used for MariaDB — no new library needed |
| Free and open source | No licensing cost |

**What this database stores (Modules 2–9):**
- Client profiles and KYC/AML documents (M2)
- Trading model definitions (M3)
- Pre-trade allocation matrices (M4)
- Allotment and redemption requests (M5)
- Model client assignment records (M6)
- EOD/EOM/Risk report records (M7)
- Feature flag configuration (M8)
- Compliance audit log (M9)

| Environment | Setup |
|-------------|-------|
| Local development | PostgreSQL in Docker (via `docker-compose`) |
| Production | Managed PostgreSQL service (e.g., AWS RDS, Supabase, Railway) |

---

### Database 3 — IB Data DB (MongoDB, new)

**MongoDB** is a document database — unlike relational databases, it stores data as flexible JSON-like documents with no fixed schema required. This makes it well suited for IB API data, which is anticipated to be structurally inconsistent and may change format without warning (similar to the subsidiary profile documents encountered in the other project).

| Reason for MongoDB | Explanation |
|-------------------|-------------|
| No fixed schema | IB API responses may have different fields across calls, different nesting, or evolving structure — MongoDB stores them as-is without failing |
| Raw storage first | We can store the full raw IB response and process it into reports separately, rather than trying to map it into rigid table columns at ingest time |
| Independent failure domain | If the IB data pipeline has issues, the business logic database is unaffected |
| PyMongo / Motor | Well-supported Python libraries for MongoDB; Motor provides async support compatible with FastAPI |

**What this database stores (Module 10 onwards):**
- Raw IB API responses, stored as documents with a timestamp and source tag
- Processed snapshots used by reporting (M7) once IB integration is complete

**Access pattern:** The backend writes IB data into MongoDB when fetching from the IB API (Module 10). The reporting service (Module 7) reads from MongoDB to generate EOD/EOM reports. No other module reads from MongoDB directly.

> **Note:** Until Module 10 (IB API integration) is implemented, MongoDB is set up in the project but contains no data. Report endpoints in Module 7 that depend on IB data return stub responses.

---

### Connection management in the backend

Each database has its own connection module under `app/database/`. The backend application initialises all three connections at startup and closes them on shutdown. A failure to connect to MongoDB (IB data) at startup should not prevent the rest of the API from functioning, since IB data is not required for core business operations.

```
app/database/
├── mariadb.py      # SQLAlchemy engine + session for MariaDB (user accounts)
├── postgres.py     # SQLAlchemy engine + session for PostgreSQL (business logic)
└── mongodb.py      # Motor async client for MongoDB (IB data)
```

Each database is configured via its own environment variable in `.env`:

```
MARIADB_URL=mysql+pymysql://user:pass@host:3306/userdb
POSTGRES_URL=postgresql+asyncpg://user:pass@host:5432/bizdb
MONGODB_URL=mongodb://user:pass@host:27017/ibdata
```

---

## 10. Recommended Project Structure

The following directory layout extends the existing skeleton into the proposed modular structure. Each module lives in its own subdirectory under `app/routers/` and `app/services/`.

```
api-backend/
├── app/
│   ├── main.py                         # App entry point — registers all routers, initialises all DB connections
│   ├── config.py                       # Environment variable configuration (reads .env)
│   │
│   ├── database/                       # One connection module per database
│   │   ├── mariadb.py                  # SQLAlchemy engine + session → MariaDB (user accounts)
│   │   ├── postgres.py                 # SQLAlchemy engine + session → PostgreSQL (business logic)
│   │   └── mongodb.py                  # Motor async client → MongoDB (IB data)
│   │
│   ├── models/                         # Data models — grouped by which database they live in
│   │   ├── mariadb/                    # SQLAlchemy ORM models for MariaDB
│   │   │   └── user.py                 # M1: user record, role enum
│   │   ├── postgres/                   # SQLAlchemy ORM models for PostgreSQL
│   │   │   ├── client_profile.py       # M2: client personal and investment profile
│   │   │   ├── kyc_document.py         # M2: KYC/AML document records
│   │   │   ├── trading_model.py        # M3: trading model table
│   │   │   ├── allocation.py           # M4: pre-trade allocation matrix
│   │   │   ├── financial_request.py    # M5: allotment and redemption requests
│   │   │   ├── model_client_assignment.py  # M6: live client-to-model assignment ledger
│   │   │   ├── feature_flag.py         # M8: role-feature configuration
│   │   │   └── audit_log.py            # M9: compliance audit log
│   │   └── mongodb/                    # MongoDB document schemas (Pydantic, not SQLAlchemy)
│   │       └── ib_data.py              # M10: shape of raw IB API response documents
│   │
│   ├── schemas/                        # Request/response shapes for the API (Pydantic)
│   │   ├── user.py
│   │   ├── auth.py
│   │   ├── onboarding.py
│   │   ├── trading_model.py
│   │   ├── allocation.py
│   │   ├── financial_request.py
│   │   ├── model_client_assignment.py
│   │   └── audit_log.py
│   │
│   ├── routers/                        # API route handlers (one file per module)
│   │   ├── auth.py                     # M1: /api/auth/*
│   │   ├── users.py                    # M1: /api/users/*
│   │   ├── onboarding.py               # M2: /api/onboarding/*
│   │   ├── trading_models.py           # M3: /api/trading-models/*
│   │   ├── pre_trade.py                # M4: /api/pre-trade/*
│   │   ├── allotment.py                # M5: /api/financial/allotments/*
│   │   ├── redemption.py               # M5: /api/financial/redemptions/*
│   │   ├── model_client_assignment.py  # M6: /api/model-assignments/*
│   │   ├── reports.py                  # M7: /api/reports/*
│   │   ├── feature_flags.py            # M8: /api/admin/features/*
│   │   └── audit_log.py                # M9: /api/admin/audit-log/*
│   │
│   ├── services/                       # Business logic (one file per module)
│   │   ├── onboarding.py               # M2: uses PostgreSQL
│   │   ├── trading_models.py           # M3: uses PostgreSQL
│   │   ├── pre_trade.py                # M4: uses PostgreSQL
│   │   ├── financial_requests.py       # M5: uses PostgreSQL; triggers M6 on execution
│   │   ├── model_client_assignment.py  # M6: uses PostgreSQL; written only by M5
│   │   ├── reports.py                  # M7: reads PostgreSQL + MongoDB (when IB ready)
│   │   ├── feature_flags.py            # M8: uses PostgreSQL
│   │   ├── audit_log.py                # M9: uses PostgreSQL; called by M2, M4, M5
│   │   └── ib_api/                     # M10: IB API integration (TODO stub)
│   │       ├── __init__.py
│   │       ├── README.md               # Explains what this module is waiting for
│   │       ├── stub.py                 # All functions raise NotImplementedError
│   │       └── ingest.py               # (stub) Will fetch from IB API and write to MongoDB
│   │
│   └── deps/                           # Shared FastAPI dependencies
│       └── auth.py                     # Firebase token validation, role guards, feature flag checks
│
├── docs/
│   └── proposal.md                     # This document
├── .env.example                        # Template for environment variables (never commit .env)
├── requirements.txt
├── Dockerfile
└── docker-compose.yml                  # Spins up PostgreSQL + MongoDB locally (MariaDB is existing)
```

### Key environment variables

```ini
# Firebase
FIREBASE_AUTH_DISABLED=false           # Set true only for local dev; NEVER in production

# Database 1 — User Account (MariaDB, existing)
MARIADB_URL=mysql+pymysql://user:pass@host:3306/userdb

# Database 2 — Business Logic (PostgreSQL)
POSTGRES_URL=postgresql+asyncpg://user:pass@host:5432/bizdb

# Database 3 — IB Data (MongoDB)
MONGODB_URL=mongodb://user:pass@host:27017/ibdata
MONGODB_DB_NAME=ibdata
```

---

## 11. Extensibility Principles

The following principles guide how the backend should be built so that new features and roles can be added without breaking existing functionality.

### 1. Each module is self-contained

A module's routes, business logic, and models are co-located and do not reach into other modules except through well-defined interfaces (function calls or database queries). Adding a new feature area means adding new files, not modifying many existing ones.

### 2. Roles are defined in one place

The `UserRole` enum in `app/models/user.py` is the single source of truth for all roles. Adding a new role means adding one entry here. The rest of the system picks it up automatically.

### 3. Route guards are declarative

Every route declares its allowed roles using the `require_roles()` dependency (already implemented in the skeleton). A developer reading a route handler can immediately see who is allowed to call it — no buried logic.

### 4. Module 6 is always written by the system, never by users

The model client assignment ledger is the authoritative source of truth for client portfolio composition. Its integrity depends on it being updated only through the controlled execution path in Module 5. No API route should expose a direct write endpoint for Module 6 data.

### 5. Module 9 is always append-only

The compliance audit log must never expose update or delete endpoints. Code review should enforce this as a hard rule.

### 6. Feature flags are additive

New features can be added to the feature flag table without affecting existing ones. Features start as disabled for all roles and are enabled by ADMIN configuration. This means incomplete features can be deployed safely without exposing them to users.

### 7. The IB API stub is a contract

The `ib_api/` stub module defines function signatures that the rest of the system calls. When IB integration is implemented, the stub is replaced with real implementations behind the same signatures. No other code needs to change.

---

## 12. Open Questions and TBD Items

The following items require decisions before or during implementation. They are tracked here so nothing is forgotten.

| # | Question | Relevant module | Priority |
|---|----------|-----------------|----------|
| TBD-1 | KYC/AML document types, required fields, and expiry rules | M2, M9 | High |
| TBD-2 | Pre-trade allocation matrix: exact fields, sign-off states, rejection flow | M4 | High |
| TBD-3 | Allotment/redemption lifecycle states (e.g., Submitted → Approved → Executed → Settled?) | M5 | High |
| TBD-4 | Model Client Assignment fields: allocation percentage, unit quantity, effective date, etc. | M6 | High |
| TBD-5 | EOD Report: what data does it contain? How is it generated? Triggered manually or on schedule? | M7 | High |
| TBD-6 | EOM Report: what does the client see? Calculated by us or fetched from IB? | M7 | High |
| TBD-7 | MariaDB access: connection credentials, host, database name, and whether the existing schema needs any new columns for this project | M1, DB | High |
| TBD-8 | Post-trade Risk Report: metrics, thresholds, data source | M7 | Medium |
| TBD-9 | IB API: which product (Client Portal API / TWS API / FIX), access credentials, data fields | M10 | Medium |
| TBD-10 | MongoDB: will it be self-hosted (Docker/VM) or a managed service (MongoDB Atlas)? | DB | Medium |
| TBD-11 | Audit log: retention period, export format for regulators, who can view it | M9 | Medium |
| TBD-12 | Which feature flags are ADMIN-configurable vs. always hard-coded? Full list required | M8 | Medium |
| TBD-13 | Multi-tenancy: will this portal ever serve more than one fund/organization from one deployment? | Architecture | Low |
| TBD-14 | Email notifications: should any actions (e.g., KYC approval, allotment execution) trigger email alerts? | M2, M5 | Low |

### Resolved decisions

| Decision | Resolution |
|----------|------------|
| Single vs. multiple databases | Three physically separate databases confirmed (v3) |
| User Account DB technology | MariaDB — existing instance to be reused |
| Business Logic DB technology | PostgreSQL — new instance |
| IB Data DB technology | MongoDB — new instance; chosen for schema-flexible storage of unstructured IB API responses |
| Firebase role in architecture | Authentication and token verification only; user records live in MariaDB |
| OPS role | Removed; replaced by MOBO |
| Portfolio Commander vs. Portfolio Manager | Separate roles — PC has exclusive write access to trading models and pre-trade allocation sign-off |
