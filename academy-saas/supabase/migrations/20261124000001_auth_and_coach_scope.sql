-- =============================================================================
-- Phase 2: coaches only see their own teams (audit finding #5), and every new
-- Supabase Auth user automatically gets a profile row.
-- =============================================================================

-- ---------------------------------------------------------------- coach scope
drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated
  using (app.is_finance(academy_id) or id in (select app.my_team_ids(academy_id)));

drop policy if exists team_coaches_read on public.team_coaches;
create policy team_coaches_read on public.team_coaches for select to authenticated
  using (app.is_finance(academy_id) or team_id in (select app.my_team_ids(academy_id)));

-- coaches: staff/finance see everyone; a coach sees their own record and co-coaches of their teams
drop policy if exists coaches_read on public.coaches;
create policy coaches_read on public.coaches for select to authenticated
  using (app.is_finance(academy_id) or user_id = auth.uid() or exists (
    select 1 from public.team_coaches tc
     where tc.coach_id = coaches.id and tc.team_id in (select app.my_team_ids(coaches.academy_id))));

-- ---------------------------------------------------------------- profiles
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, preferred_locale)
  values (new.id,
          nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
          case when new.raw_user_meta_data->>'locale' in ('en', 'ar', 'fr') then new.raw_user_meta_data->>'locale' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
