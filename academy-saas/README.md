# AcademyOS (working name)

International sports academy management SaaS — multi-tenant, EN / AR (RTL) / FR.
**Status: Phase 1** — complete frontend running on fictional demo data. Not production-ready.

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

## Quality checks

```bash
npm run check        # lint + type-check + unit tests + translation-key check
```

Database tests (tenant isolation, permissions, money rules) need a local PostgreSQL:

```bash
PGURL=postgres://postgres@localhost:5432/postgres sh supabase/tests/run_local.sh
```

## Where things live

| Path | What |
|---|---|
| `src/config/app.ts` | Temporary product name, currencies, time zones |
| `src/app/globals.css` | Colour palette & design tokens |
| `messages/*.json` | All interface text (en, ar, fr) |
| `src/lib/domain/` | Money & permission rules (pure, unit-tested) |
| `src/lib/store/academy-store.tsx` | Phase 1 data layer → replaced by Supabase in Phase 2 |
| `supabase/migrations/` | Database schema + row-level security |
