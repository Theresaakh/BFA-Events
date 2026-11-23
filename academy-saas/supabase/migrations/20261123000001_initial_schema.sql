-- =============================================================================
-- Academy SaaS — initial schema
-- Multi-tenant: every tenant-owned row carries academy_id, and Row Level
-- Security (RLS) restricts every query to academies the signed-in user belongs to.
-- Money is stored as integer minor units (e.g. cents) together with an ISO-4217
-- currency code. Balances are NEVER stored: they are computed from payment
-- allocations (see view invoice_balances).
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;          -- private helper functions (not exposed via the API)

-- ----------------------------------------------------------------------------- enums
create type public.member_role       as enum ('owner', 'admin', 'finance', 'coach');
create type public.member_status     as enum ('invited', 'active', 'disabled');
create type public.player_status     as enum ('active', 'trial', 'inactive', 'suspended', 'archived');
create type public.contact_kind      as enum ('guardian', 'emergency');
create type public.session_status    as enum ('scheduled', 'completed', 'cancelled');
create type public.attendance_status as enum ('present', 'absent', 'excused');
create type public.invoice_status    as enum ('draft', 'issued', 'void');
create type public.charge_type       as enum ('membership', 'registration', 'tournament', 'camp', 'trip', 'custom');
create type public.payment_method    as enum ('cash', 'bank_transfer', 'card', 'cheque', 'mobile_money', 'other');

-- ----------------------------------------------------------------------------- reference data (global, not tenant-owned)
create table public.sports (
  code        text primary key,                 -- 'football', 'basketball', ...
  name_en     text not null,
  name_ar     text not null,
  name_fr     text not null,
  active      boolean not null default true
);
insert into public.sports(code, name_en, name_ar, name_fr) values
  ('football',   'Football',   'كرة القدم', 'Football'),
  ('basketball', 'Basketball', 'كرة السلة', 'Basket-ball');

-- ----------------------------------------------------------------------------- tenants & users
create table public.academies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(name) between 2 and 120),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  default_locale  text not null default 'en' check (default_locale in ('en', 'ar', 'fr')),
  currency        char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  timezone        text not null default 'UTC',
  country         char(2),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz                    -- soft delete; hard delete handled by a retention job
);

-- 1:1 with auth.users (managed by Supabase Auth)
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text,
  preferred_locale  text check (preferred_locale in ('en', 'ar', 'fr')),
  created_at        timestamptz not null default now()
);

create table public.academy_members (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null,
  status      public.member_status not null default 'active',
  created_at  timestamptz not null default now(),
  unique (academy_id, user_id)
);

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  name        text not null,
  address     text,
  city        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (academy_id, id)
);

create table public.locations (                 -- pitches, courts, halls
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null,
  branch_id   uuid not null,
  name        text not null,
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.branches(academy_id, id) on delete cascade
);

-- Coaches are people. They MAY have a login (user_id) — a coach without a login
-- can still be assigned to teams and sessions.
create table public.coaches (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  full_name   text not null,
  email       text,
  phone       text,
  branch_id   uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, user_id),
  foreign key (academy_id, branch_id) references public.branches(academy_id, id)
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  branch_id   uuid,
  sport_code  text not null references public.sports(code),
  name        text not null,
  age_group   text,                              -- 'U10', 'U14', 'Senior' ...
  category    text,                              -- 'Boys', 'Girls', 'Mixed', 'Elite' ...
  season      text,                              -- '2026/27'
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.branches(academy_id, id)
);

create table public.team_coaches (
  academy_id  uuid not null,
  team_id     uuid not null,
  coach_id    uuid not null,
  is_head     boolean not null default false,
  primary key (team_id, coach_id),
  foreign key (academy_id, team_id)  references public.teams(academy_id, id)   on delete cascade,
  foreign key (academy_id, coach_id) references public.coaches(academy_id, id) on delete cascade
);

-- ----------------------------------------------------------------------------- players
create table public.players (
  id                 uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references public.academies(id) on delete cascade,
  player_code        text not null,              -- human-readable ID, unique per academy (e.g. PLR-00042)
  first_name         text not null,
  last_name          text not null,
  date_of_birth      date,
  gender             text check (gender in ('male', 'female', 'other')),
  status             public.player_status not null default 'active',
  registration_date  date not null default current_date,
  branch_id          uuid,
  photo_path         text,                       -- path in a PRIVATE storage bucket, never a public URL
  notes              text,                       -- keep minimal; no medical details in phase 1
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, player_code),
  foreign key (academy_id, branch_id) references public.branches(academy_id, id)
);

-- Team membership with history (end_date set when a player leaves a team)
create table public.player_team_assignments (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null,
  player_id   uuid not null,
  team_id     uuid not null,
  start_date  date not null default current_date,
  end_date    date,
  check (end_date is null or end_date >= start_date),
  foreign key (academy_id, player_id) references public.players(academy_id, id) on delete cascade,
  foreign key (academy_id, team_id)   references public.teams(academy_id, id)   on delete cascade
);
create unique index one_open_assignment_per_team
  on public.player_team_assignments(player_id, team_id) where end_date is null;

-- Guardians and emergency contacts (sensitive: restricted by RLS)
create table public.player_contacts (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null,
  player_id     uuid not null,
  kind          public.contact_kind not null,
  full_name     text not null,
  relationship  text,
  phone         text,
  email         text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  foreign key (academy_id, player_id) references public.players(academy_id, id) on delete cascade
);

-- ----------------------------------------------------------------------------- schedule & attendance
create table public.training_sessions (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  team_id        uuid not null,
  coach_id       uuid,
  location_id    uuid,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         public.session_status not null default 'scheduled',
  cancel_reason  text,
  notes          text,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (academy_id, id),
  foreign key (academy_id, team_id)     references public.teams(academy_id, id)     on delete cascade,
  foreign key (academy_id, coach_id)    references public.coaches(academy_id, id),
  foreign key (academy_id, location_id) references public.locations(academy_id, id)
);
create index on public.training_sessions(academy_id, starts_at);

create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null,
  session_id   uuid not null,
  player_id    uuid not null,
  status       public.attendance_status not null,
  note         text,
  recorded_by  uuid references auth.users(id),
  recorded_at  timestamptz not null default now(),
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz,
  unique (session_id, player_id),
  foreign key (academy_id, session_id) references public.training_sessions(academy_id, id) on delete cascade,
  foreign key (academy_id, player_id)  references public.players(academy_id, id)           on delete cascade
);

-- ----------------------------------------------------------------------------- invoicing & payments
create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  number      text not null,                     -- INV-2026-00001, unique per academy
  player_id   uuid not null,
  currency    char(3) not null check (currency ~ '^[A-Z]{3}$'),
  issue_date  date not null default current_date,
  due_date    date not null,
  status      public.invoice_status not null default 'draft',
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  check (due_date >= issue_date),
  unique (academy_id, id),
  unique (academy_id, number),
  foreign key (academy_id, player_id) references public.players(academy_id, id)
);

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null,
  invoice_id   uuid not null,
  charge_type  public.charge_type not null,
  description  text not null,
  quantity     numeric(10, 2) not null default 1 check (quantity > 0),
  unit_amount  bigint not null check (unit_amount >= 0),               -- minor units
  amount       bigint generated always as (round(quantity * unit_amount)::bigint) stored,
  foreign key (academy_id, invoice_id) references public.invoices(academy_id, id) on delete cascade
);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id) on delete cascade,
  receipt_number  text not null,                 -- RCT-2026-00001, unique per academy
  player_id       uuid not null,
  amount          bigint not null check (amount > 0),                  -- minor units
  currency        char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_on         date not null default current_date,
  method          public.payment_method not null,
  reference       text,
  received_by     uuid references auth.users(id),
  voided_at       timestamptz,                   -- payments are voided, never deleted
  void_reason     text,
  created_at      timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, receipt_number),
  foreign key (academy_id, player_id) references public.players(academy_id, id)
);

-- A payment can be split over several invoices; an invoice can receive many payments.
create table public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null,
  payment_id  uuid not null,
  invoice_id  uuid not null,
  amount      bigint not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (payment_id, invoice_id),
  foreign key (academy_id, payment_id) references public.payments(academy_id, id) on delete cascade,
  foreign key (academy_id, invoice_id) references public.invoices(academy_id, id) on delete cascade
);

-- Guard rails for allocations: same currency, invoice issued, no over-allocation.
create or replace function app.check_allocation() returns trigger
language plpgsql as $$
declare
  p record; i record; inv_total bigint; inv_alloc bigint; pay_alloc bigint;
begin
  select * into p from public.payments where id = new.payment_id;
  select * into i from public.invoices where id = new.invoice_id;
  if p.voided_at is not null then raise exception 'Cannot allocate a voided payment'; end if;
  if i.status <> 'issued' then raise exception 'Payments can only be allocated to issued invoices'; end if;
  if p.currency <> i.currency then
    raise exception 'Currency mismatch: payment % vs invoice %', p.currency, i.currency;
  end if;
  if p.player_id <> i.player_id then raise exception 'Payment and invoice belong to different players'; end if;

  select coalesce(sum(amount), 0) into inv_total from public.invoice_lines where invoice_id = new.invoice_id;
  select coalesce(sum(a.amount), 0) into inv_alloc
    from public.payment_allocations a join public.payments py on py.id = a.payment_id
   where a.invoice_id = new.invoice_id and py.voided_at is null and a.id <> new.id;
  select coalesce(sum(amount), 0) into pay_alloc
    from public.payment_allocations where payment_id = new.payment_id and id <> new.id;

  if inv_alloc + new.amount > inv_total then
    raise exception 'Allocation exceeds the invoice balance (% remaining)', inv_total - inv_alloc;
  end if;
  if pay_alloc + new.amount > p.amount then
    raise exception 'Allocation exceeds the unallocated payment amount (% remaining)', p.amount - pay_alloc;
  end if;
  return new;
end $$;

create trigger payment_allocations_check
  before insert or update on public.payment_allocations
  for each row execute function app.check_allocation();

-- Balances are derived, never typed in.
create or replace view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.academy_id,
  i.player_id,
  i.number,
  i.currency,
  i.issue_date,
  i.due_date,
  i.status,
  coalesce(l.total, 0)                         as total,
  coalesce(a.paid, 0)                          as paid,
  coalesce(l.total, 0) - coalesce(a.paid, 0)   as balance,
  case
    when i.status = 'void'  then 'void'
    when i.status = 'draft' then 'draft'
    when coalesce(l.total, 0) - coalesce(a.paid, 0) <= 0 then 'paid'
    when i.due_date < current_date and coalesce(a.paid, 0) = 0 then 'overdue'
    when i.due_date < current_date then 'partially_paid_overdue'
    when coalesce(a.paid, 0) > 0 then 'partially_paid'
    else 'unpaid'
  end                                          as payment_status
from public.invoices i
left join (select invoice_id, sum(amount) total from public.invoice_lines group by invoice_id) l
       on l.invoice_id = i.id
left join (select al.invoice_id, sum(al.amount) paid
             from public.payment_allocations al
             join public.payments p on p.id = al.payment_id and p.voided_at is null
            group by al.invoice_id) a
       on a.invoice_id = i.id;

-- Per-academy document counters (invoice / receipt / player numbers)
create table public.academy_counters (
  academy_id  uuid not null references public.academies(id) on delete cascade,
  key         text not null,
  value       bigint not null default 0,
  primary key (academy_id, key)
);

create or replace function app.next_number(p_academy uuid, p_key text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not app.is_member(p_academy) then raise exception 'Not a member of this academy'; end if;
  insert into public.academy_counters(academy_id, key, value) values (p_academy, p_key, 1)
  on conflict (academy_id, key) do update set value = public.academy_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------- audit log
create table public.audit_log (
  id          bigserial primary key,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  actor_id    uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index on public.audit_log(academy_id, at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log(academy_id, actor_id, table_name, record_id, action, old_data, new_data)
  values ((rec->>'academy_id')::uuid, auth.uid(), tg_table_name, (rec->>'id')::uuid, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['players', 'player_contacts', 'player_team_assignments', 'attendance_records',
                           'invoices', 'invoice_lines', 'payments', 'payment_allocations', 'academy_members']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function app.audit()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------- authorization helpers
-- SECURITY DEFINER so they can read academy_members without recursive RLS.
create or replace function app.my_role(p_academy uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.academy_members
   where academy_id = p_academy and user_id = auth.uid() and status = 'active'
$$;

create or replace function app.is_member(p_academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.my_role(p_academy) is not null
$$;

create or replace function app.has_role(p_academy uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role(p_academy) = any(p_roles), false)
$$;

-- Teams the current user coaches (empty for non-coaches)
create or replace function app.my_team_ids(p_academy uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select tc.team_id from public.team_coaches tc
    join public.coaches c on c.id = tc.coach_id
   where c.academy_id = p_academy and c.user_id = auth.uid()
$$;

-- Players currently in one of the current user's teams
create or replace function app.coach_can_see_player(p_academy uuid, p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.player_team_assignments a
     where a.academy_id = p_academy and a.player_id = p_player and a.end_date is null
       and a.team_id in (select app.my_team_ids(p_academy)))
$$;

-- Short-hands
create or replace function app.is_staff(p_academy uuid) returns boolean      -- owner/admin
language sql stable as $$ select app.has_role(p_academy, array['owner', 'admin']::public.member_role[]) $$;
create or replace function app.is_finance(p_academy uuid) returns boolean    -- owner/admin/finance
language sql stable as $$ select app.has_role(p_academy, array['owner', 'admin', 'finance']::public.member_role[]) $$;

-- ----------------------------------------------------------------------------- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['academies', 'profiles', 'academy_members', 'branches', 'locations', 'coaches', 'teams',
                           'team_coaches', 'players', 'player_team_assignments', 'player_contacts',
                           'training_sessions', 'attendance_records', 'invoices', 'invoice_lines', 'payments',
                           'payment_allocations', 'academy_counters', 'audit_log', 'sports']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- sports: readable by any signed-in user
create policy sports_read on public.sports for select to authenticated using (true);

-- profiles: own row only
create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- academies
create policy academies_read   on public.academies for select to authenticated using (app.is_member(id));
create policy academies_update on public.academies for update to authenticated
  using (app.is_staff(id)) with check (app.is_staff(id));
-- (creating an academy happens through a server-side onboarding function, not direct inserts)

-- members: everyone in the academy can see the member list; only owners manage it
create policy members_read  on public.academy_members for select to authenticated using (app.is_member(academy_id));
create policy members_write on public.academy_members for all to authenticated
  using (app.has_role(academy_id, array['owner']::public.member_role[]))
  with check (app.has_role(academy_id, array['owner']::public.member_role[]));

-- generic "members read, staff write" tables
do $$
declare t text;
begin
  foreach t in array array['branches', 'locations', 'coaches', 'teams', 'team_coaches']
  loop
    execute format('create policy %I_read on public.%I for select to authenticated using (app.is_member(academy_id))', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated
                      using (app.is_staff(academy_id)) with check (app.is_staff(academy_id))', t, t);
  end loop;
end $$;

-- players: owner/admin/finance see all; coaches see only players in their teams
create policy players_read on public.players for select to authenticated
  using (app.is_finance(academy_id) or app.coach_can_see_player(academy_id, id));
create policy players_write on public.players for all to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));

create policy pta_read on public.player_team_assignments for select to authenticated
  using (app.is_finance(academy_id) or team_id in (select app.my_team_ids(academy_id)));
create policy pta_write on public.player_team_assignments for all to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));

-- contacts (sensitive): staff + finance (billing), and coaches for their own players (safety)
create policy contacts_read on public.player_contacts for select to authenticated
  using (app.is_finance(academy_id) or app.coach_can_see_player(academy_id, player_id));
create policy contacts_write on public.player_contacts for all to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));

-- sessions: members read (coaches: own teams only); staff write
create policy sessions_read on public.training_sessions for select to authenticated
  using (app.is_finance(academy_id) or team_id in (select app.my_team_ids(academy_id)));
create policy sessions_write on public.training_sessions for all to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));

-- attendance: staff do everything (corrections are audited);
-- coaches record for their own teams' sessions, and may change their own records for 48h
create policy attendance_read on public.attendance_records for select to authenticated
  using (app.is_finance(academy_id) or exists (
    select 1 from public.training_sessions s
     where s.id = session_id and s.team_id in (select app.my_team_ids(s.academy_id))));
create policy attendance_staff on public.attendance_records for all to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy attendance_coach_insert on public.attendance_records for insert to authenticated
  with check (recorded_by = auth.uid() and exists (
    select 1 from public.training_sessions s
     where s.id = session_id and s.academy_id = attendance_records.academy_id
       and s.team_id in (select app.my_team_ids(s.academy_id)))
    and app.coach_can_see_player(academy_id, player_id));
create policy attendance_coach_update on public.attendance_records for update to authenticated
  using (recorded_by = auth.uid() and recorded_at > now() - interval '48 hours')
  with check (recorded_by = auth.uid());

-- finance tables: owner/admin/finance only. Coaches never see money.
do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_lines', 'payment_allocations']
  loop
    execute format('create policy %I_finance on public.%I for all to authenticated
                      using (app.is_finance(academy_id)) with check (app.is_finance(academy_id))', t, t);
  end loop;
end $$;
-- payments can be created and voided (update) but never deleted
create policy payments_read   on public.payments for select to authenticated using (app.is_finance(academy_id));
create policy payments_insert on public.payments for insert to authenticated with check (app.is_finance(academy_id));
create policy payments_update on public.payments for update to authenticated
  using (app.is_finance(academy_id)) with check (app.is_finance(academy_id));

-- academy_counters: no client policies at all; only app.next_number (security definer) touches it.

-- audit log: read-only for owners/admins; written only by the trigger
create policy audit_read on public.audit_log for select to authenticated using (app.is_staff(academy_id));

-- Lock down the helper schema
revoke all on schema app from public;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
