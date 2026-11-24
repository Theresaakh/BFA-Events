-- Tenant-isolation & permission tests. Run against a fresh database:
--   psql -v ON_ERROR_STOP=1 -f local_auth_stub.sql -f ../migrations/*.sql -f rls_test.sql
\set QUIET on
-- ---------- fixtures (as superuser, bypassing RLS) ----------
insert into auth_user(id,name,email,email_verified) values
 ('00000000-0000-0000-0000-00000000000a','Test','owner.a@example.test',true),
 ('00000000-0000-0000-0000-00000000000c','Test','coach.a@example.test',true),
 ('00000000-0000-0000-0000-00000000000f','Test','finance.a@example.test',true),
 ('00000000-0000-0000-0000-00000000000b','Test','owner.b@example.test',true);
insert into academies(id,name,slug,currency) values
 ('aaaaaaaa-0000-0000-0000-000000000000','Academy A','academy-a','USD'),
 ('bbbbbbbb-0000-0000-0000-000000000000','Academy B','academy-b','EUR');
insert into academy_members(academy_id,user_id,role) values
 ('aaaaaaaa-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000000a','owner'),
 ('aaaaaaaa-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000000c','coach'),
 ('aaaaaaaa-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000000f','finance'),
 ('bbbbbbbb-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000000b','owner');
insert into coaches(id,academy_id,user_id,full_name) values
 ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000000c','Coach A');
insert into teams(id,academy_id,sport_code,name,age_group) values
 ('a1000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','football','A U12','U12'),
 ('a2000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','basketball','A U16','U16'),
 ('b1000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','football','B U12','U12');
insert into team_coaches(academy_id,team_id,coach_id) values
 ('aaaaaaaa-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000001');
insert into players(id,academy_id,player_code,first_name,last_name) values
 ('d1000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','PLR-1','Test','InA1'),
 ('d2000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','PLR-2','Test','InA2'),
 ('d3000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','PLR-1','Test','InB');

insert into player_team_assignments(academy_id,player_id,team_id) values
 ('aaaaaaaa-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000'),
 ('aaaaaaaa-0000-0000-0000-000000000000','d2000000-0000-0000-0000-000000000000','a2000000-0000-0000-0000-000000000000');
insert into player_contacts(academy_id,player_id,kind,full_name,phone) values
 ('aaaaaaaa-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','guardian','Parent One','+10000000001'),
 ('aaaaaaaa-0000-0000-0000-000000000000','d2000000-0000-0000-0000-000000000000','guardian','Parent Two','+10000000002');

create schema t;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
create function t.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'PASS: % (blocked: %)', msg, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded but should not)', msg;
end $$;
grant usage on schema t to authenticated, anon; grant execute on all functions in schema t to authenticated, anon;
\set QUIET off

-- =========== Owner of Academy B: must see nothing of Academy A ===========
select set_config('app.user_id','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select t.ok((select count(*) from players) = 1, 'owner B sees only their own 1 player');
select t.ok((select count(*) from players where academy_id='aaaaaaaa-0000-0000-0000-000000000000') = 0, 'owner B sees 0 players of academy A');
select t.ok((select count(*) from player_contacts) = 0, 'owner B sees 0 contacts of academy A');
select t.ok((select count(*) from academies) = 1, 'owner B sees only their own academy');
select t.fails($$insert into players(academy_id,player_code,first_name,last_name) values ('aaaaaaaa-0000-0000-0000-000000000000','X','Evil','Insert')$$, 'owner B cannot insert a player into academy A');
update players set first_name='Hacked' where academy_id='aaaaaaaa-0000-0000-0000-000000000000';
reset role;
select t.ok((select count(*) from players where first_name='Hacked') = 0, 'owner B update on academy A changed 0 rows');

-- =========== Coach of Academy A: only own team ===========
select set_config('app.user_id','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select t.ok((select count(*) from players) = 1 and (select last_name from players) = 'InA1', 'coach sees only the player in their team');
select t.ok((select count(*) from player_contacts) = 1, 'coach sees only contacts of their own players');
select t.fails($$insert into players(academy_id,player_code,first_name,last_name) values ('aaaaaaaa-0000-0000-0000-000000000000','X','No','Perm')$$, 'coach cannot create players');
select t.ok((select count(*) from invoices) = 0, 'coach sees no invoices');
reset role;

-- session for team A1 and A2
insert into training_sessions(id,academy_id,team_id,starts_at,ends_at) values
 ('e1000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000', now(), now()+interval '90 min'),
 ('e2000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','a2000000-0000-0000-0000-000000000000', now(), now()+interval '90 min');

set role authenticated;
insert into attendance_records(academy_id,session_id,player_id,status,recorded_by) values
 ('aaaaaaaa-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','present','00000000-0000-0000-0000-00000000000c');
select t.ok(true, 'coach records attendance for own team');
select t.fails($$insert into attendance_records(academy_id,session_id,player_id,status,recorded_by) values ('aaaaaaaa-0000-0000-0000-000000000000','e2000000-0000-0000-0000-000000000000','d2000000-0000-0000-0000-000000000000','present','00000000-0000-0000-0000-00000000000c')$$, 'coach cannot record attendance for another team');
select t.ok((select count(*) from training_sessions) = 1, 'coach sees only own team sessions');
select t.ok((select count(*) from teams) = 1, 'coach sees only their own team (not the other teams of the academy)');
select t.ok((select count(*) from coaches) = 1, 'coach sees only themselves / their co-coaches');
reset role;

-- =========== Owner A corrects attendance -> audited ===========
select set_config('app.user_id','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
update attendance_records set status='excused', updated_by=auth.uid(), updated_at=now() where player_id='d1000000-0000-0000-0000-000000000000';
select t.ok((select count(*) from audit_log where table_name='attendance_records' and action='UPDATE' and actor_id=auth.uid()) = 1, 'owner correction is in the audit log with the actor');
reset role;

-- =========== Finance A: invoice 100, payments 40 + 30 ===========
select set_config('app.user_id','00000000-0000-0000-0000-00000000000f',false);
set role authenticated;
insert into invoices(id,academy_id,number,player_id,currency,issue_date,due_date,status) values
 ('f1000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','INV-1','d1000000-0000-0000-0000-000000000000','USD',current_date,current_date+30,'issued');
insert into invoice_lines(academy_id,invoice_id,charge_type,description,unit_amount) values
 ('aaaaaaaa-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000000','membership','Monthly fee',10000);
insert into payments(id,academy_id,receipt_number,player_id,amount,currency,method) values
 ('f2000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','R-1','d1000000-0000-0000-0000-000000000000',4000,'USD','cash'),
 ('f3000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','R-2','d1000000-0000-0000-0000-000000000000',3000,'USD','bank_transfer'),
 ('f4000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','R-3','d1000000-0000-0000-0000-000000000000',5000,'EUR','cash');
insert into payment_allocations(academy_id,payment_id,invoice_id,amount) values
 ('aaaaaaaa-0000-0000-0000-000000000000','f2000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000000',4000),
 ('aaaaaaaa-0000-0000-0000-000000000000','f3000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000000',3000);
select t.ok((select total=10000 and paid=7000 and balance=3000 and payment_status='partially_paid' from invoice_balances), 'invoice 100 - paid 40+30 = 30 remaining, partially paid');
select t.fails($$insert into payment_allocations(academy_id,payment_id,invoice_id,amount) values ('aaaaaaaa-0000-0000-0000-000000000000','f4000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000000',1000)$$, 'EUR payment cannot pay a USD invoice');
select t.fails($$update payment_allocations set amount=9000 where payment_id='f3000000-0000-0000-0000-000000000000'$$, 'allocation cannot exceed invoice balance or payment amount');
delete from payments where id='f2000000-0000-0000-0000-000000000000';
select t.ok((select count(*) from payments where id='f2000000-0000-0000-0000-000000000000') = 1, 'payments cannot be deleted (only voided)');
update payments set voided_at=now(), void_reason='Bounced' where id='f3000000-0000-0000-0000-000000000000';
select t.ok((select paid=4000 and balance=6000 from invoice_balances), 'voided payment no longer counts: balance back to 60');
select t.ok((select count(*) from audit_log) = 0, 'finance cannot read the audit log');
reset role;

-- =========== Owner B cannot see A's money ===========
select set_config('app.user_id','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select t.ok((select count(*) from invoices) = 0 and (select count(*) from payments) = 0 and (select count(*) from invoice_balances) = 0, 'owner B sees no invoices/payments/balances of academy A');
reset role;
-- anonymous users see nothing
set role anon;
select t.fails($$select count(*) from players$$, 'anonymous users cannot read players');
reset role;
-- profile auto-creation
insert into auth_user(id,name,email,email_verified,locale) values ('00000000-0000-0000-0000-0000000000ee','New Person','new@example.test',false,'ar');
select t.ok((select full_name='New Person' and preferred_locale='ar' from profiles where id='00000000-0000-0000-0000-0000000000ee'), 'new auth user gets a profile automatically');
select set_config('app.user_id','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select t.fails($$select count(*) from auth_user$$, 'signed-in users cannot read the accounts table');
select t.fails($$select count(*) from auth_session$$, 'signed-in users cannot read sessions');
select t.ok((select count(*) from profiles) = 1 and (select id from profiles) = '00000000-0000-0000-0000-00000000000b', 'users see only their own profile, never other people''s');
reset role;
\echo ALL TESTS PASSED
