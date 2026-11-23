# Academy SaaS — Architecture (Phase 0)

> Working name: **AcademyOS**. The name lives in one place, `src/config/app.ts`, so a rebrand is a one-line change.
> Status: architecture + Phase 1 frontend. **Not production-ready, and no legal-compliance claims are made.**

---

## 1. Requirements analysis

| Area | What really matters | Design consequence |
|---|---|---|
| Multi-tenant SaaS | Academy A must never see Academy B | `academy_id` on every row, plus **Postgres Row Level Security**, tested automatically |
| Children's data | Guardians, emergency contacts, minors | Least-privilege roles, contacts in a separate table with stricter rules, audit log, private file storage, data minimisation |
| Money | Partial payments, many payments per invoice, many currencies | Integer minor units + currency code; balances **derived** from allocations; no cross-currency totals |
| Coaches on the field | Phones, quick attendance | Mobile-first attendance screen, large tap targets |
| International | EN / AR (RTL) / FR, currencies, time zones | Locale-prefixed routes, logical CSS (start/end), `Intl` formatting with the academy's time zone and currency |
| Solo founder | Must stay maintainable | One Next.js app, Supabase for DB, auth and storage, no microservices, few dependencies |

**Decisions on ambiguous points:**
1. **A player has one currency context:** the academy's currency at the time of invoicing. Each invoice and payment stores its own currency, so changing the academy currency later never rewrites history.
2. **Payment status is computed, not stored:** `draft → unpaid → partially paid → paid`, plus "overdue" when past the due date with a balance. Only `draft / issued / void` is stored.
3. **Payments are voided, never deleted.** This protects the audit trail.
4. **Coaches don't need a login to exist.** A coach record can be linked to a user account later.

## 2. Technical architecture

```
Browser (Next.js React UI, EN/AR/FR)
   │  HTTPS
   ▼
Next.js 16 server (Vercel or any Node host)
   ├─ proxy.ts ............ locale routing (+ session refresh in Phase 2)
   ├─ Server Components ... read data with the USER'S session (RLS applies)
   ├─ Server Actions ...... validated (Zod) writes, permission checks
   └─ never holds the service-role key except in tightly-scoped admin jobs
   ▼
Supabase
   ├─ Auth ............... email/password, magic links, invitations
   ├─ Postgres ........... schema + RLS policies + triggers (audit, money guards)
   └─ Storage ............ PRIVATE bucket for player photos and documents (signed URLs)
```

**Stack (as you requested; no substitutions):** Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4, Supabase (Postgres, Auth, Storage), Zod, next-intl, GitHub.
Additions, each small and justified: `lucide-react` (icons), `clsx` (class names), `vitest` (unit tests for money logic).
Charts are small hand-written SVG components, so there's no heavy chart library and they work correctly in RTL.

**Security rules for secrets:** only `NEXT_PUBLIC_SUPABASE_URL` and the public **anon/publishable** key reach the browser. The service-role key lives only in server environment variables and is never imported into client code (`import 'server-only'` guards).

## 3. Database schema

File: `supabase/migrations/20261123000001_initial_schema.sql` (tested by `supabase/tests/rls_test.sql`).

```
academies ─┬─ academy_members (user ↔ academy, role)
           ├─ branches ── locations
           ├─ coaches ── team_coaches ── teams (sport_code → sports)
           ├─ players ─┬─ player_team_assignments (history) ── teams
           │           └─ player_contacts (guardian | emergency)
           ├─ training_sessions (team, coach, location) ── attendance_records (player)
           ├─ invoices ── invoice_lines (charge_type, qty × unit_amount)
           ├─ payments ── payment_allocations ── invoices
           ├─ academy_counters (INV / RCT / PLR numbers)
           └─ audit_log (who changed what, before/after JSON)
view: invoice_balances  → total, paid, balance, payment_status  (derived, never typed in)
```

Key rules enforced **in the database**, not just the UI:
* **Composite foreign keys** `(academy_id, id)`: a player from Academy A physically can't be put in a team of Academy B.
* **Allocation trigger:**
  * an allocation can't exceed the invoice balance or the payment's unallocated amount;
  * the payment and the invoice must use the same currency;
  * the invoice must be issued, and the payment can't be voided.
* **Audit triggers** on players, contacts, team assignments, attendance, invoices, invoice lines, payments, allocations and memberships.
* **Money** is `bigint` minor units (10000 = $100.00), so there are no floating-point rounding errors.

## 4. Folder structure

```
academy-saas/
├─ docs/ARCHITECTURE.md
├─ messages/en.json · ar.json · fr.json      ← all UI text
├─ supabase/migrations/…sql · tests/…
└─ src/
   ├─ proxy.ts                               ← locale routing (Next 16 name for middleware)
   ├─ config/app.ts                          ← temporary product name, defaults
   ├─ i18n/routing.ts · request.ts · navigation.ts
   ├─ app/
   │  ├─ globals.css                         ← design tokens (navy/green/gray)
   │  └─ [locale]/
   │     ├─ layout.tsx                       ← <html lang dir>, fonts, providers
   │     └─ (app)/layout.tsx                 ← sidebar + header shell
   │        ├─ dashboard/ players/ players/[id]/ teams/ attendance/
   │        └─ schedule/ invoices/ invoices/[id]/ payments/ reports/ settings/
   ├─ components/
   │  ├─ layout/  Sidebar, Header, AppShell
   │  ├─ ui/      Button, Card, Badge, Modal, Field, Table, StatCard, charts…
   │  └─ <module>/ module-specific components
   └─ lib/
      ├─ types.ts                            ← TypeScript mirror of the DB schema
      ├─ domain/  finance.ts, attendance.ts, permissions.ts  (pure logic + tests)
      ├─ validation/ schemas.ts              ← Zod schemas, shared by forms & server
      ├─ format.ts                           ← money / date / number formatting
      ├─ mock/seed.ts                        ← FICTIONAL demo data
      └─ store/ academy-store.tsx            ← Phase 1 data layer (swapped for Supabase in Phase 2)
```

## 5. Authentication & permissions

* Supabase Auth issues a session cookie, which Next.js reads on the server (`@supabase/ssr`, Phase 2).
* A user can belong to several academies (`academy_members`). The active academy is chosen after login, and every query is still filtered by RLS.
* Permission matrix (`src/lib/domain/permissions.ts`, mirrored in SQL policies):

| Capability | Owner | Admin | Finance | Coach |
|---|:-:|:-:|:-:|:-:|
| Dashboard (operations) | ✓ | ✓ | ✓ | own teams |
| Dashboard (money) | ✓ | ✓ | ✓ | – |
| Players: view | ✓ | ✓ | ✓ | own teams |
| Players: create/edit/archive/import | ✓ | ✓ | – | – |
| Guardian/emergency contacts | ✓ | ✓ | ✓ (billing) | own players |
| Teams, coaches, branches | ✓ | ✓ | view | own teams |
| Schedule: edit | ✓ | ✓ | – | – |
| Attendance: record | ✓ | ✓ | – | own teams |
| Attendance: correct (audited) | ✓ | ✓ | – | own, within 48 h |
| Invoices & payments | ✓ | ✓ | ✓ | – |
| Reports (financial) | ✓ | ✓ | ✓ | – |
| Settings, users & roles | ✓ | ✓ (no role changes) | – | – |
| Audit log | ✓ | ✓ | – | – |

The UI hides what a role can't do (good UX). **Security comes from RLS and server checks**, never from hiding buttons.

## 6. Multi-tenant isolation, defence in depth

1. **Database (primary):** RLS on every table. Policies call `app.is_member(academy_id)` / `app.has_role(...)`, which look up the signed-in user (`auth.uid()`) in `academy_members`. A query without a matching membership returns zero rows, whatever the frontend sends.
2. **Referential integrity:** composite `(academy_id, id)` foreign keys prevent cross-tenant links.
3. **Server layer:** server actions validate input with Zod and check the role again before writing. They use the user's session, not the service-role key.
4. **Storage:** private bucket, with object paths prefixed by `academy_id/`. Storage RLS uses the same membership check, and files are served via short-lived signed URLs.
5. **Tests:** `supabase/tests/rls_test.sql` proves the following, and should run in CI on every change:
   * Academy B can't read or write Academy A's data;
   * coaches only see their own teams;
   * finance can't read the audit log;
   * money guards hold.

## 7. Internationalisation (EN / AR-RTL / FR)

* **Routes:** `/en/…`, `/ar/…`, `/fr/…` (next-intl). The academy's default language is used after login, and each user can override it.
* **RTL:** `<html dir="rtl">` for Arabic. All layout uses **logical** Tailwind utilities (`ms-*`, `pe-*`, `start-0`, `text-start`), so no separate RTL stylesheet is needed. Direction-dependent icons (chevrons, arrows) flip with `rtl:rotate-180`.
* **Fonts:** Inter for Latin scripts, plus IBM Plex Sans Arabic for Arabic.
* **Formatting:** all money, dates and numbers go through `Intl` with the academy's **currency** and **time zone**. Financial tables use Latin digits in all languages for consistency (`ar-u-nu-latn`); this is easy to change.
* **Data vs UI language:** names and notes are stored as typed. Only the interface is translated.

## 8. Data protection notes (not legal advice)

* Development uses **fictional data only** (`src/lib/mock/seed.ts`). Phone numbers use the reserved 555-01xx range.
* Collect only what's needed. There are deliberately **no medical fields** in Phase 1, and adding any requires a review.
* Contacts are visible only to roles that need them (see the matrix above).
* Retention: archived players keep their financial history (accounting obligations). A scheduled job (Phase 5) will **anonymise** personal fields after a configurable retention period, and hard-delete an academy's data after account closure plus a grace period.
* Before real launch you'll need, at minimum:
  * a privacy policy and data-processing agreement for academies;
  * a decision on data-residency regions;
  * a security review and penetration test;
  * a legal review for the countries you sell to (e.g. GDPR in the EU, local child-data rules).

## 9. Roadmap

| Phase | Scope | Outcome |
|---|---|---|
| **0** ✅ | Requirements, architecture, schema, RLS tests | This document |
| **1** ✅ | Frontend foundation with **mock data**: shell, sidebar, header, 9 modules working in-browser, EN/AR/FR, responsive | Clickable product you can demo |
| 2 | Supabase project, auth (sign-up/login/invite), onboarding (create academy), replace mock store with real queries and server actions | Real multi-tenant app |
| 3 | Finance hardening: invoice/receipt numbering, PDF receipts and invoices, monthly batch invoicing, real Excel (.xlsx) import/export | Billing you can trust |
| 4 | Attendance and schedule polish: recurring sessions, coach mobile flow, reports by coach/team/date, PDF/Excel reports | Daily operations |
| 5 | SaaS layer: subscription billing (Stripe), plan limits, academy onboarding, data-retention jobs, audit-log UI, backups | Sellable product |
| 6 | Launch readiness: security review, accessibility pass, monitoring, legal documents, staging/production environments | Production |
