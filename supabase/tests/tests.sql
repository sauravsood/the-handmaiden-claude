-- Behavioural tests for the schema. Each block raises on failure.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'admin2@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'w1@workers.invalid'),
  ('00000000-0000-0000-0000-00000000000d', 'w2@workers.invalid'),
  ('00000000-0000-0000-0000-00000000000e', 'stranger@example.com');

create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', u, false) $$;

-- Owner creates a household and invites a second admin.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_household('Sood home', 'Asia/Kolkata', 'Saurav');
insert into public.admin_invites (household_id, email) values (public.my_household_id(), 'admin2@example.com');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (public.accept_invite('Second admin')).role <> 'admin' then raise exception 'invite not accepted'; end if;
  if not public.is_admin() then raise exception 'admin2 should be admin'; end if;
end $$;

-- Workers are created by the service endpoint; simulate it.
reset role;
insert into public.members (id, household_id, user_id, role, display_name)
select '10000000-0000-0000-0000-000000000001', household_id, '00000000-0000-0000-0000-00000000000c', 'worker', 'Asha'
from public.members where user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.members (id, household_id, user_id, role, display_name)
select '10000000-0000-0000-0000-000000000002', household_id, '00000000-0000-0000-0000-00000000000d', 'worker', 'Meena'
from public.members where user_id = '00000000-0000-0000-0000-00000000000a';

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_worker_pin('10000000-0000-0000-0000-000000000001', '1-2-3-4');
create temp table tok as select public.issue_device_link('10000000-0000-0000-0000-000000000001') as t;

-- Worker sign-in check (service role only).
do $$ begin
  perform public.verify_worker_login('10000000-0000-0000-0000-000000000001', (select t from tok), '1-2-3-4');
  raise exception 'authenticated user must not call verify_worker_login';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$
declare r jsonb; i int;
begin
  r := public.verify_worker_login('10000000-0000-0000-0000-000000000001', (select t from tok), '1-2-3-4');
  if r->>'email' <> 'w1@workers.invalid' then raise exception 'wrong result %', r; end if;
  if public.verify_worker_login('10000000-0000-0000-0000-000000000001', 'nope', '1-2-3-4')->>'error' <> 'bad_link' then
    raise exception 'wrong token accepted';
  end if;
  for i in 1..5 loop
    r := public.verify_worker_login('10000000-0000-0000-0000-000000000001', (select t from tok), '4-3-2-1');
    if r->>'error' <> 'bad_pin' then raise exception 'wrong pin accepted: %', r; end if;
  end loop;
  -- Locked after five wrong codes, even with the right one.
  if public.verify_worker_login('10000000-0000-0000-0000-000000000001', (select t from tok), '1-2-3-4')->>'error' <> 'locked' then
    raise exception 'not locked';
  end if;
  update public.member_secrets set locked_until = null, failed_attempts = 0;
end $$;

-- Schedule rules.
do $$
declare t public.tasks;
begin
  t.schedule_kind := 'repeat'; t.repeat_from := 'schedule'; t.starts_on := '2026-11-02'; -- a Monday
  t.freq := 'daily'; t.interval := 2;
  if not public.task_due_on(t, '2026-11-04') or public.task_due_on(t, '2026-11-03') then raise exception 'daily/2'; end if;
  if public.task_due_on(t, '2026-11-01') then raise exception 'before start'; end if;
  t.freq := 'weekly'; t.interval := 1; t.by_weekday := '{1,4}';
  if not public.task_due_on(t, '2026-11-05') or public.task_due_on(t, '2026-11-06') then raise exception 'weekly mon/thu'; end if;
  t.interval := 2;
  if public.task_due_on(t, '2026-11-09') or not public.task_due_on(t, '2026-11-16') then raise exception 'fortnightly'; end if;
  t.freq := 'monthly'; t.interval := 1; t.by_weekday := null; t.by_monthday := '{31}';
  if not public.task_due_on(t, '2026-11-30') then raise exception '31st clamps to 30 Nov'; end if;
  t.by_monthday := '{-1}';
  if not public.task_due_on(t, '2027-02-28') or public.task_due_on(t, '2027-02-27') then raise exception 'last day'; end if;
  t.by_monthday := '{15}'; t.by_month := '{3,9}';
  if public.task_due_on(t, '2026-12-15') or not public.task_due_on(t, '2027-03-15') then raise exception 'by month'; end if;
  t.freq := 'yearly'; t.by_month := null; t.by_monthday := null; t.starts_on := '2026-11-10';
  if not public.task_due_on(t, '2027-11-10') or public.task_due_on(t, '2027-10-10') then raise exception 'yearly'; end if;
  t.ends_on := '2027-01-01';
  if public.task_due_on(t, '2027-11-10') then raise exception 'ends_on'; end if;
end $$;

-- Admin creates tasks: a daily task copied to two workers and a one-off.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.tasks (id, household_id, worker_id, title, schedule_kind, freq, starts_on, photo_required, copy_group_id, created_at)
select '20000000-0000-0000-0000-000000000001', public.my_household_id(), '10000000-0000-0000-0000-000000000001',
       'Wash dishes', 'repeat', 'daily', public.household_today(public.my_household_id()) - 3, true,
       '30000000-0000-0000-0000-000000000001', now() - interval '3 days';
insert into public.tasks (id, household_id, worker_id, title, schedule_kind, freq, starts_on, copy_group_id, created_at)
select '20000000-0000-0000-0000-000000000002', public.my_household_id(), '10000000-0000-0000-0000-000000000002',
       'Wash dishes', 'repeat', 'daily', public.household_today(public.my_household_id()) - 3,
       '30000000-0000-0000-0000-000000000001', now() - interval '3 days';
insert into public.tasks (id, household_id, worker_id, title, schedule_kind, due_date)
select '20000000-0000-0000-0000-000000000003', public.my_household_id(), '10000000-0000-0000-0000-000000000001',
       'Clean fan', 'once', public.household_today(public.my_household_id());
insert into public.tasks (id, household_id, worker_id, title, schedule_kind, freq, interval, repeat_from)
select '20000000-0000-0000-0000-000000000004', public.my_household_id(), '10000000-0000-0000-0000-000000000001',
       'Clean fridge', 'repeat', 'weekly', 2, 'completion';

do $$ begin
  if public.refresh_occurrences() <> 10 then raise exception 'expected 4+4+1+1 occurrences'; end if;
  if public.refresh_occurrences() <> 0 then raise exception 'refresh must be idempotent'; end if;
  if (select count(*) from public.occurrences where status = 'missed') <> 6 then
    raise exception 'older daily occurrences should be missed, got %', (select count(*) from public.occurrences where status = 'missed');
  end if;
end $$;

-- Worker 1 sees only their own tasks and occurrences.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$
declare o uuid;
begin
  if (select count(*) from public.tasks) <> 3 then raise exception 'worker sees % tasks', (select count(*) from public.tasks); end if;
  if exists (select 1 from public.occurrences where worker_id <> public.my_member_id()) then raise exception 'leak'; end if;
  if (select count(*) from public.member_secrets) <> 0 then raise exception 'secrets visible'; end if;
  -- Worker cannot edit tasks.
  update public.tasks set title = 'hacked';
  if exists (select 1 from public.tasks where title = 'hacked') then raise exception 'worker edited task'; end if;
  -- Photo proof is enforced only where required.
  select id into o from public.occurrences where task_id = '20000000-0000-0000-0000-000000000001' and status = 'open';
  begin
    perform public.complete_occurrence(o, null);
    raise exception 'completed without photo';
  exception when others then if sqlerrm <> 'photo_required' then raise; end if;
  end;
  perform public.complete_occurrence(o, 'h/proof.jpg');
  select id into o from public.occurrences where task_id = '20000000-0000-0000-0000-000000000003';
  perform public.complete_occurrence(o, null);
  if (select done_late from public.occurrences where id = o) then raise exception 'not late'; end if;
  perform public.undo_completion(o);
  if (select status from public.occurrences where id = o) <> 'open' then raise exception 'undo failed'; end if;
  perform public.complete_occurrence(o, null);
  -- Floating task spawns the next occurrence two weeks out.
  select id into o from public.occurrences where task_id = '20000000-0000-0000-0000-000000000004';
  perform public.complete_occurrence(o, null);
  if not exists (select 1 from public.occurrences where task_id = '20000000-0000-0000-0000-000000000004'
                 and due_date = public.household_today(public.my_household_id()) + 14) then
    raise exception 'floating next occurrence missing';
  end if;
  -- Worker cannot review.
  begin
    perform public.review_occurrence(o, 'approved', null);
    raise exception 'worker reviewed';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end $$;

-- Admin 2 flags the dishes, edits requirements and reopens it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$
declare o public.occurrences; v int;
begin
  select * into o from public.occurrences where task_id = '20000000-0000-0000-0000-000000000001' and status = 'done';
  if o.review_status <> 'pending' then raise exception 'should await review'; end if;
  perform public.review_occurrence(o.id, 'flagged', 'Greasy pans left');
  update public.tasks set description = 'Scrub pans too', edited_at = now(), edit_note = 'Added pans'
  where id = '20000000-0000-0000-0000-000000000001';
  select version into v from public.tasks where id = '20000000-0000-0000-0000-000000000001';
  if v <> 2 then raise exception 'version not bumped'; end if;
  if (select snapshot->>'description' from public.task_revisions where task_id = '20000000-0000-0000-0000-000000000001') <> '' then
    raise exception 'original requirements not kept';
  end if;
  perform public.reopen_occurrence(o.id, 'Please redo, pans too');
  select * into o from public.occurrences where id = o.id;
  if o.status <> 'open' or o.attempt <> 2 then raise exception 'reopen failed'; end if;
  if (select review_status from public.occurrence_attempts where occurrence_id = o.id) <> 'flagged' then
    raise exception 'attempt history missing';
  end if;
  if (select count(*) from public.comments where occurrence_id = o.id) <> 2 then raise exception 'comments missing'; end if;
  -- Linked follow-up task.
  insert into public.tasks (household_id, worker_id, title, schedule_kind, due_date, linked_from_occurrence_id, link_reason)
  values (public.my_household_id(), '10000000-0000-0000-0000-000000000001', 'Deep clean pans', 'once',
          public.household_today(public.my_household_id()) + 1, o.id, 'Pans were greasy');
  if (select count(*) from public.activity where action = 'occurrence_flagged') <> 1 then raise exception 'activity'; end if;
end $$;

-- A stranger with no household sees nothing.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  if exists (select 1 from public.tasks) or exists (select 1 from public.occurrences)
     or exists (select 1 from public.members) then raise exception 'stranger sees data'; end if;
  if public.accept_invite(null) is not null then raise exception 'stranger joined'; end if;
end $$;

-- Revoking a worker kills their sessions and link.
reset role;
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.revoke_worker_devices('10000000-0000-0000-0000-000000000001');
reset role;
do $$ begin
  if exists (select 1 from auth.sessions) then raise exception 'sessions remain'; end if;
  if public.worker_link_info('10000000-0000-0000-0000-000000000001', (select t from tok)) is not null then
    raise exception 'old link still works';
  end if;
end $$;
