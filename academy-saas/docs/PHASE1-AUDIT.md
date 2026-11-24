# AcademyOS — Phase 1: Audit & Technical Plan

Status: approved. **Update (Phase 2):** Supabase was replaced by **Neon (PostgreSQL) + Better Auth** (see §2). The database design, RLS rules and tests are unchanged in substance.
Scope: the AcademyOS prototype (the standalone `AcademyOS.html` and the source it is built from, in `academy-saas/`).

---

## 1. Audit of the existing prototype

### 1.1 What it is technically
| Aspect | Today |
|---|---|
| Code | Next.js 16 + React 19 + TypeScript + Tailwind v4 + next-intl + Zod. About 4,800 lines in `src/`. |
| Builds | (a) Next.js app (`npm run dev`); (b) a single-file standalone build (`demo/`, via Vite) used for the Claude link and `AcademyOS.html`. |
| Data | **All data lives in the browser** (`localStorage`), generated from fictional seed data (`src/lib/mock/seed.ts`). One academy only. |
| Logic | Money and permission rules are pure functions in `src/lib/domain/` (unit-tested: 9 tests). The screens go through one store (`src/lib/store/academy-store.tsx`). |
| Database | A Supabase/PostgreSQL schema with RLS exists (`supabase/migrations/…_initial_schema.sql`) and passes 23 SQL tests, but **the app is not connected to it yet**. |
| Design | Night-match identity: midnight indigo / electric violet / volt; Barlow Condensed headings; light, dark and system themes; EN/AR/FR with RTL; responsive down to phones. |

### 1.2 Screen-by-screen inventory
| Module | What a user can do today |
|---|---|
| Dashboard | Matchday banner; 10 KPIs (players, active, teams, coaches, sessions today, attendance rate, invoiced/collected this month, outstanding, overdue); 6-month invoiced vs collected chart; attendance donut; today's sessions; next 7 days; recent payments. Coaches see their teams only and no money. |
| Players | Search (name, ID, guardian, phone); status filter; team and sport filters; add/edit (identity, membership, team, branch, guardian, emergency contact, notes); archive/restore; auto player IDs; CSV import with row-by-row validation; CSV export; profile with overview, attendance, finance and history (team history + change log) tabs. |
| Teams & Coaches | Team cards (sport, age group, category, season, branch, coaches, roster size, attendance rate); create/edit team with head and assistant coaches; roster management; coach list (teams, branch, contact, has-login). |
| Branches | A tab inside Settings: list branches, add branch, add locations (pitches, courts). |
| Attendance | Pick a date and session; mark present/absent/excused with large buttons; "mark the rest present"; a coach can only edit their own records within 48 h; admin corrections require a reason and are audited; reports by player, team and coach with date filters; CSV export. |
| Schedule | Month/week/day views; filter by team and branch; create/edit sessions (team, coach, location, academy time zone); cancel with reason / restore. |
| Invoices | KPIs; filters (status, month, charge type, search); create with several lines (6 charge types, quantity, unit price), save as draft or issue; detail page with derived balance and payment history; issue a draft; void (only if no live payments). |
| Payments | Record a payment (amount, date, method, reference); split across open invoices with "oldest first" auto-allocation; unapplied remainder kept as credit; receipt view; void with reason (never delete). |
| Reports | Financial (monthly invoiced/collected/outstanding, collection rate, revenue by charge type, overdue list), attendance by team, registrations and players by status, team overview. |
| Settings | Academy name, default language, currency, time zone; branches and locations; users list (read-only); permission matrix; privacy notes; audit log; reset demo data. |

### 1.3 Implemented vs simulated vs missing

**Really implemented** (works and is reusable as-is in production):
- The full UI and design system: layout, sidebar, header, dialogs, tables, charts, badges, light/dark/system themes.
- Three languages with RTL: 100% key coverage, checked by `npm run check:i18n`.
- Money rules: integer minor units, balances derived from allocations, never adding different currencies together, FIFO allocation suggestions, voiding instead of deleting.
- Form validation schemas (Zod), ready to reuse on the server.
- Time-zone-correct scheduling and formatting (Intl).
- The database schema with RLS, composite tenant keys, money guard trigger, audit triggers, and the SQL isolation tests.

**Simulated** (looks real, but isn't yet):
| Feature | Why it's simulated |
|---|---|
| Login and roles | The "View as" switcher replaces real authentication. Anyone can become owner. |
| Permissions | Enforced only in the browser. The real enforcement (RLS) exists but isn't connected. |
| Multi-tenancy | Only one academy exists. There's no sign-up and no academy switching. |
| Persistence | Per browser, per device. Clearing the browser loses everything, and there's no sharing between staff. |
| Audit log | Written by the browser, so it can be edited. The real one is the database trigger. |
| Numbering | Invoice, receipt and player numbers come from browser counters. Two users would get duplicates. |
| Export / print | CSV and browser print work in the Next.js app. PDF, `.xlsx`, and printing in the Claude link do not. |
| Users & roles | Read-only list: no invitations, no role changes. |

**Missing** (needed for your requirements):
- **Fee structures:** monthly/yearly fee plans, assigning plans to players, and automatic monthly or yearly invoice runs. Today every invoice is manual, and the suggested fee is a constant written into the code (football 120.00 / basketball 150.00).
- **Discounts and adjustments:** sibling or scholarship discounts, credit notes, refunds, and applying an existing credit to a new invoice.
- **Draft invoices can't be edited:** you can only issue or void them.
- **Coaches:** you can't create or edit a coach, and coach accounts can't be linked.
- **Branches as their own module:** you asked for one; today it's a Settings tab.
- **Guardians shared between siblings:** each contact is copied per player, so you can't bill one family.
- **Recurring sessions:** for example "every Monday and Wednesday at 17:00 until June".
- **Files:** player photos and documents (stored securely).
- **Regional formats:** date format, first day of the week, and number format per academy (today they're fixed by language).
- **Notifications:** email for invitations, password reset, and later payment reminders.
- **SaaS layer:** academy sign-up, subscription plans, plan limits, and platform administration.

### 1.4 Technical weaknesses and bugs found
| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | **Duplicate allocation bug:** in the browser check, one payment that lists the same invoice twice can over-pay it (verified: two lines of 80 against a 100 invoice are accepted). The database trigger would reject it. | High (finance) | Group allocations by invoice before checking; add a regression test. |
| 2 | Every write happens in the browser, with no server validation. | Critical (prod) | Server actions + Zod + RLS (Phase 3). |
| 3 | Fictional personal data is stored unencrypted in `localStorage`. Acceptable for a demo; **must never hold real data**. | Critical (prod) | Real data only in the database. The demo stays fictional. |
| 4 | IDs are generated in the browser (`Date.now`). | Medium | UUIDs from the database. |
| 5 | Teams, coaches, branches and sessions are readable by all members in RLS. Your rule says coaches only access their own teams. | Medium | Tighten the `teams`/`team_coaches` read policies to the coach's own teams. |
| 6 | Multi-step money operations (payment + allocations, issuing + numbering) aren't atomic in the prototype. | High (prod) | One PostgreSQL function per operation (transaction). |
| 7 | Lists are capped in the browser (300 rows), with no pagination. | Medium | Server-side pagination and search. |
| 8 | The greeting uses the device clock, not the academy time zone. "Today" is correct. | Low | Use the academy time zone. |
| 9 | Players with a balance in a former currency show 0 in the player list. | Low | Show a balance per currency. |
| 10 | Accessibility: dialogs set the initial focus but don't trap it; the segmented controls don't announce their pressed state. | Medium | Focus trap, `aria-pressed`, keyboard pass. |
| 11 | The standalone build hides Print/Export with a CSS rule. | Low | Proper feature flags per build. |
| 12 | There's no CI: tests run only by hand. | Medium | GitHub Actions: lint, types, unit, SQL/RLS, e2e. |

---

## 2. Recommended final architecture

**Keep your stack.** It fits the product, and the prototype already uses it. Recommended additions:

| Need | Choice | Why |
|---|---|---|
| Hosting (app) | **Vercel** | Made for Next.js; preview link per change; free to start. |
| Database | **Neon** (serverless PostgreSQL), region **EU (Frankfurt)** | Standard PostgreSQL (all RLS rules work unchanged), generous free plan, database branches for testing. |
| Accounts | **Better Auth** (inside the app) | Users and sessions stored in our own database; no third-party login service; email + password, verification, reset, 2FA later. |
| File storage | **Cloudflare R2** (Phase 3a) | Private bucket, signed links, no egress fees. |
| Server logic | Next.js **Server Components** (reads) + **Server Actions** (writes) | One codebase, and no API keys in the browser. |
| Money and numbering | **PostgreSQL functions** (`record_payment`, `issue_invoice`, `run_billing`) | Atomic transactions; the same rules no matter who calls them. |
| Transactional email | **Resend** (or Supabase SMTP) | Invitations, password reset, later reminders. |
| Errors and monitoring | **Sentry** | Know about bugs before customers do. |
| Tests | Vitest (logic), SQL/pgTAP (RLS), **Playwright** (end-to-end) | Isolation and roles tested on every change. |
| CI | GitHub Actions | Nothing merges unless the checks pass. |

**Request flow:** browser → Next.js server (validates the session cookie with Better Auth) → PostgreSQL through `withUser()`, which switches to the restricted `authenticated` role and sets the user id, so RLS applies → result.
The database password and auth secret exist only in server environment variables, never in the browser.

**Proposed folder structure**

```
academy-saas/
├─ supabase/migrations/            schema, RLS, functions (versioned)
├─ supabase/seed.sql               fictional dev data (generated from today's seed)
├─ supabase/tests/                 RLS & finance tests
├─ e2e/                            Playwright journeys per role
├─ messages/{en,ar,fr}.json
└─ src/
   ├─ app/[locale]/(auth)/         login, sign-up, invite, reset password
   ├─ app/[locale]/(app)/          dashboard, players, teams, branches, attendance,
   │                               schedule, invoices, payments, reports, settings
   ├─ features/<module>/           components/ · queries.ts · actions.ts · schemas.ts
   ├─ components/{ui,layout}/      today's design system, unchanged
   ├─ lib/domain/                  pure rules (finance, permissions) — reused
   ├─ lib/supabase/                server.ts · browser.ts · admin.ts (server-only)
   └─ proxy.ts                     locale + session refresh + auth redirect
```

---

## 3. Database schema (target, v2)

It builds on the existing tested migration. ★ = new or changed.

**Tenancy and users**
- `academies` (name, slug, country, currency, timezone, default_locale, ★date_format, ★week_start, status, deleted_at)
- `profiles` (1:1 with `auth.users`: full_name, preferred_locale)
- `academy_members` (academy, user, role, status), ★`invitations` (academy, email, role, token hash, expires_at, accepted_at)

**Structure**
- `branches`, `locations`
- `sports` (global), ★`academy_sports` (which sports an academy offers)
- `coaches` (optional login link), `teams` (sport, age group, category, season, branch), `team_coaches` (is_head)

**People**
- `players` (player_code, names, DOB, gender, status, registration date, branch, photo path, archived_at)
- `player_team_assignments` (history with start/end)
- ★`guardians` (shared between siblings: name, phone, email, preferred language)
- ★`player_guardians` (relationship, is_primary, is_billing_contact, is_emergency)
- ★`emergency_contacts` (for non-guardian contacts)
- ★`player_documents` (storage path, type, uploaded_by)

**Schedule and attendance**
- ★`session_series` (team, weekdays, start time, duration, from–until)
- `training_sessions` (optional series link, team, coach, location, start/end, status, cancel reason)
- `attendance_records` (unique per session + player, status, recorded_by, updated_by)

**Finance**
- ★`fee_plans` (name, amount, currency, interval: monthly / yearly / one-off, scope: sport / team / age group)
- ★`player_fee_plans` (player, plan, start/end, discount %, or a fixed override)
- `invoices` (+ ★`billing_period_start/end`, ★`source`: manual / plan run, ★`guardian_id` as bill-to)
- `invoice_lines`, `payments`, `payment_allocations`
- ★`credit_notes` + `credit_allocations` (refunds, corrections)
- view `invoice_balances` (derived)

**Platform**
- `academy_counters`, `audit_log` (+ ★ip, ★user_agent)
- ★`subscription_plans`, ★`academy_subscriptions` (the AcademyOS SaaS billing, later)

**Key relationships:** every academy-owned table has `academy_id` and a composite foreign key `(academy_id, id)`, so data can't cross tenants. A player has many guardians and a guardian has many players (siblings). A player has many invoices; an invoice has many lines; a payment can be split across many invoices through allocations. Balances are always computed.

---

## 4. Authentication and permissions

**Authentication.** Supabase Auth with email + password and magic link. 2FA (TOTP) is available and recommended for owners and finance.
1. **Sign-up:** the owner creates an account, and a server function creates the academy, the owner membership and the default settings.
2. **Staff:** the owner or admin invites by email with a role; the person accepts and sets a password.
3. **Coach link:** a coach account is tied to its coach record, which drives the team-scoped access.
4. **Several academies:** a user can belong to more than one; there will be an academy switcher.

**Permission matrix** (enforced by RLS + server checks; the UI mirrors it):

| Area | Owner | Admin | Finance | Coach |
|---|---|---|---|---|
| Academy settings | view, edit | view, edit | view | – |
| Users and roles | invite, change roles, remove | invite (not owner/admin roles) | – | – |
| Branches / locations | full | full | view | view own branch |
| Teams | full | full | view | view own teams |
| Coaches | full | full | view | view self |
| Players | full (archive, never hard-delete) | full | view | view own teams' players |
| Guardian / emergency contacts | full | full | view (billing) | view own players |
| Schedule | full | full | view | view own teams |
| Attendance | record, correct (reason required) | record, correct | view reports | record own teams; edit own records ≤ 48 h |
| Fee plans | full | full | full | – |
| Invoices | full (void instead of delete) | full | full | – |
| Payments | record, void | record, void | record, void | – |
| Reports | all | all | financial + player | attendance for own teams |
| Audit log | view | view | – | – |

Hard deletes are only possible through a retention or "close academy" job, never from the screens.

---

## 5. Migration plan (keeps the design and every feature)

1. **Screens and components stay.** All of `components/ui`, `components/layout` and the module views are kept; only their data source changes.
2. **One module at a time,** replacing `useStore()` with Supabase queries (Server Components) and actions (Server Actions + Zod). The store's action names map 1:1 to server actions (`savePlayer`, `recordPayment`, …), so each screen's change is small.
3. **The domain rules stay** (`lib/domain`), shared by the browser for instant feedback and by the server for enforcement. The database functions remain the final authority.
4. **The seed becomes `supabase/seed.sql`:** the same fictional academy, with a second fictional academy added to test isolation.
5. **The demo build stays** as a sales and demo sandbox (the Claude link, `AcademyOS.html`), explicitly fictional and never connected to real data.
6. **Each module is done only when** the same e2e journey passes for all four roles, in EN and AR, on phone and desktop.

---

## 6. Prioritized roadmap

| Phase | Deliverables | Exit criteria |
|---|---|---|
| **2 · Foundation** | Supabase project (EU), env setup, migrations applied, Supabase SSR clients, proxy (locale + session), login / sign-up / reset pages in 3 languages, CI pipeline, fix bug #1 | Sign in and out works in EN/AR/FR; CI green |
| **3a · Tenancy & people** | Academy creation, invitations and roles, academy switcher, Branches module, Coaches CRUD, Players + shared guardians, team rosters, photo upload | Isolation e2e: academy A can't see B; coach sees own teams only |
| **3b · Operations** | Schedule with recurring series, attendance on real data, attendance reports | Coach phone flow tested |
| **4 · Finance** | Fee plans, monthly/yearly billing run, draft editing, invoices, payments with atomic allocations, credit notes, PDF invoices and receipts, `.xlsx` export, financial reports | Finance test suite (partials, splits, voids, credits, currencies) green |
| **5 · Launch readiness** | Full role × language × device test matrix, accessibility pass, backups and restore drill, monitoring, rate limits, privacy policy and DPA templates, retention and anonymisation job | Security review checklist passed |
| **Later** | SaaS subscriptions (Stripe), parent portal, payment gateway (after a security review), mobile app wrapper | — |

---

## 7. Decisions needed from you
| Decision | Options | Recommendation |
|---|---|---|
| Data region | EU (Frankfurt) / Middle East / US | **EU (Frankfurt)**: broad legal fit, close to Middle East and Africa customers |
| Hosting | Vercel / Netlify / own server | **Vercel**: least maintenance for Next.js |
| Repository | Keep inside BFA-Events / new repo | **New private repo `academyos`**: clean history and access |
| Billing model for academies | Per-player fee plans / per-team / manual only | **Per-player fee plans with team/sport defaults** |
| Sibling handling | Separate invoices / one family invoice | **Separate invoices per player, billed to a shared guardian**: simpler, and still lets you show family totals |
| Product name | AcademyOS (temporary) | Decide before buying a domain; it's one config value |
