# AcademyOS (working name)

International sports academy management SaaS — multi-tenant, EN / AR (RTL) / FR.
**Status: Phase 2 (foundation)**: accounts (login, sign-up, password reset), route protection and CI are in place. Screens still use fictional demo data until Phase 3. Not production-ready.

Plan and audit: [`docs/PHASE1-AUDIT.md`](docs/PHASE1-AUDIT.md).

Read the architecture first: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it on your computer

1. Install **Node.js 22 LTS** from <https://nodejs.org> (this is separate from Python).
2. In a terminal, inside this `academy-saas` folder:

```bash
npm install
npm run dev
```

3. Open <http://localhost:3000> — you'll land on `/en/dashboard`. Switch language with the globe menu,
   and switch role (owner / admin / finance / coach) from the user menu in the top-right.

Your changes are kept in the browser (localStorage). **Settings → Data & privacy → Reset demo data** starts over.

## Turning on real accounts (Neon + Better Auth)

1. Create a free PostgreSQL database at <https://neon.tech> (region **Frankfurt / aws-eu-central-1**).
2. Apply the SQL files in `database/migrations/` in order (Neon → SQL Editor, or `psql "$DATABASE_URL" -f …`).
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`)
   and set `NEXT_PUBLIC_ACCOUNTS_ENABLED=true`.
4. Optional for now: `RESEND_API_KEY` to send real emails. Without it (development only) confirmation and
   reset links are printed in the terminal.

With `NEXT_PUBLIC_ACCOUNTS_ENABLED=false` the app runs in **demo mode**: no login, fictional data in the browser.

## Quality checks

```bash
npm run check        # lint + type-check + unit tests + translation-key check
```

Database tests (tenant isolation, permissions, money rules) need a local PostgreSQL:

```bash
PGURL=postgres://postgres@localhost:5432/postgres sh database/tests/run_local.sh
```

## Where things live

| Path | What |
|---|---|
| `src/config/app.ts` | Temporary product name, currencies, time zones |
| `src/app/globals.css` | Colour palette & design tokens |
| `messages/*.json` | All interface text (en, ar, fr) |
| `src/lib/domain/` | Money & permission rules (pure, unit-tested) |
| `src/lib/store/academy-store.tsx` | Phase 1 data layer → replaced by Supabase in Phase 2 |
| `database/migrations/` | Database schema, accounts tables + row-level security |
| `src/lib/server/` | Server-only code: database pool (`withUser` applies RLS), accounts, email |
