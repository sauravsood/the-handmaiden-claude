-- The Handmaiden: core schema, security rules, schedules and review history.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'worker');
create type public.occ_status as enum ('open', 'done', 'skipped', 'missed');
create type public.review_status as enum ('pending', 'approved', 'flagged');
create type public.time_slot as enum ('morning', 'afternoon', 'evening', 'anytime');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  role public.member_role not null,
  display_name text not null,
  email text,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.members (household_id);

-- Secrets for worker sign-in. No policies: only security definer functions
-- and the service role can read or write this table.
create table public.member_secrets (
  member_id uuid primary key references public.members(id) on delete cascade,
  pin_hash text,
  device_token_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

create table public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  invited_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (household_id, email)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  unique (household_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  worker_id uuid not null references public.members(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority smallint not null default 4 check (priority between 1 and 4),
  schedule_kind text not null check (schedule_kind in ('once', 'repeat')),
  due_date date,
  freq text check (freq in ('daily', 'weekly', 'monthly', 'yearly')),
  interval int not null default 1 check (interval >= 1),
  by_weekday smallint[],   -- ISO weekday 1 = Monday .. 7 = Sunday
  by_monthday smallint[],  -- 1..31, or -1 for the last day of the month
  by_month smallint[],     -- 1..12, limits any repeat to these months
  repeat_from text not null default 'schedule' check (repeat_from in ('schedule', 'completion')),
  starts_on date not null default current_date,
  ends_on date,
  time_slot public.time_slot not null default 'anytime',
  exact_time time,
  photo_required boolean not null default false,
  copy_group_id uuid,
  linked_from_occurrence_id uuid,
  link_reason text,
  version int not null default 1,
  edited_at timestamptz,
  edit_note text,
  archived_at timestamptz,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  check (schedule_kind <> 'once' or due_date is not null),
  check (schedule_kind <> 'repeat' or freq is not null)
);
create index on public.tasks (household_id);
create index on public.tasks (worker_id);
create index on public.tasks (copy_group_id);

create table public.task_media (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('cover', 'photo', 'voice')),
  storage_path text not null,
  position int not null default 0,
  transcript text,
  created_at timestamptz not null default now()
);
create index on public.task_media (task_id);

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  position int not null default 0,
  label text not null default '',
  photo_path text
);
create index on public.task_steps (task_id);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

-- Jira-style history: a snapshot of the task as it was before each edit.
create table public.task_revisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  changed_by uuid references public.members(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index on public.task_revisions (task_id);

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  worker_id uuid not null references public.members(id) on delete cascade,
  due_date date not null,
  status public.occ_status not null default 'open',
  attempt int not null default 1,
  reopened_at timestamptz,
  done_at timestamptz,
  done_late boolean,
  done_by uuid references public.members(id) on delete set null,
  proof_photo_path text,
  steps_done uuid[] not null default '{}',
  task_version int,
  skipped_by uuid references public.members(id) on delete set null,
  skip_reason text,
  review_status public.review_status,
  reviewed_by uuid references public.members(id) on delete set null,
  reviewed_at timestamptz,
  spawned_by uuid references public.occurrences(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, due_date)
);
create index on public.occurrences (household_id, due_date);
create index on public.occurrences (worker_id, status);

alter table public.tasks
  add constraint tasks_linked_from_fk foreign key (linked_from_occurrence_id)
  references public.occurrences(id) on delete set null;

-- Earlier completions of an occurrence that was reopened.
create table public.occurrence_attempts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  attempt int not null,
  done_at timestamptz,
  done_late boolean,
  proof_photo_path text,
  task_version int,
  review_status public.review_status,
  reviewed_by uuid references public.members(id) on delete set null,
  reviewed_at timestamptz,
  closed_at timestamptz not null default now()
);
create index on public.occurrence_attempts (occurrence_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_id uuid references public.occurrences(id) on delete cascade,
  author_id uuid references public.members(id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'approve', 'flag', 'reopen', 'followup')),
  body text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);
create index on public.comments (task_id);
create index on public.comments (occurrence_id);

create table public.leave (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  worker_id uuid not null references public.members(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text,
  check (to_date >= from_date)
);
create index on public.leave (worker_id);

create table public.activity (
  id bigserial primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references public.members(id) on delete set null,
  action text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  occurrence_id uuid references public.occurrences(id) on delete cascade,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on public.activity (household_id, at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and active
$$;

create function public.my_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() and active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'admin') from public.members
                   where user_id = auth.uid() and active), false)
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.members
                   where user_id = auth.uid() and active), false)
$$;

create function public.household_today(p_household uuid) returns date
language sql stable set search_path = public as $$
  select (now() at time zone (select timezone from public.households where id = p_household))::date
$$;

create function public.log_activity(p_household uuid, p_action text, p_task uuid,
                                    p_occurrence uuid, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.activity (household_id, actor_id, action, task_id, occurrence_id, details)
  values (p_household, public.my_member_id(), p_action, p_task, p_occurrence, coalesce(p_details, '{}'))
$$;

-- ---------------------------------------------------------------------------
-- Schedules. Mirrors src/lib/schedule.ts; keep the two in step.
-- ---------------------------------------------------------------------------
create function public.task_due_on(t public.tasks, d date) returns boolean
language plpgsql immutable as $$
declare
  last_day int;
  dom int;
  md smallint;
  months int;
begin
  if d < t.starts_on or (t.ends_on is not null and d > t.ends_on) then
    return false;
  end if;
  if t.schedule_kind = 'once' then
    return d = t.due_date;
  end if;
  if t.repeat_from = 'completion' then
    return false; -- generated one at a time from the last completion
  end if;
  if t.by_month is not null and cardinality(t.by_month) > 0
     and not (extract(month from d)::smallint = any (t.by_month)) then
    return false;
  end if;

  if t.freq = 'daily' then
    return (d - t.starts_on) % t.interval = 0;
  elsif t.freq = 'weekly' then
    if not (extract(isodow from d)::smallint = any (
              coalesce(nullif(t.by_weekday, '{}'), array[extract(isodow from t.starts_on)::smallint]))) then
      return false;
    end if;
    return ((date_trunc('week', d)::date - date_trunc('week', t.starts_on)::date) / 7) % t.interval = 0;
  elsif t.freq = 'monthly' or t.freq = 'yearly' then
    months := (extract(year from d)::int * 12 + extract(month from d)::int)
            - (extract(year from t.starts_on)::int * 12 + extract(month from t.starts_on)::int);
    if t.freq = 'monthly' and months % t.interval <> 0 then
      return false;
    end if;
    if t.freq = 'yearly' then
      if t.by_month is null or cardinality(t.by_month) = 0 then
        if extract(month from d) <> extract(month from t.starts_on) then
          return false;
        end if;
      end if;
      if (extract(year from d)::int - extract(year from t.starts_on)::int) % t.interval <> 0 then
        return false;
      end if;
    end if;
    last_day := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
    dom := extract(day from d)::int;
    foreach md in array coalesce(nullif(t.by_monthday, '{}'), array[extract(day from t.starts_on)::smallint]) loop
      if md = -1 and dom = last_day then return true; end if;
      if md = dom then return true; end if;
      if md > last_day and dom = last_day then return true; end if; -- 31st in a 30-day month
    end loop;
    return false;
  end if;
  return false;
end
$$;

-- Next date for "repeat from completion" tasks.
create function public.next_floating_date(t public.tasks, from_date date) returns date
language sql immutable as $$
  select case t.freq
    when 'daily' then from_date + t.interval
    when 'weekly' then from_date + 7 * t.interval
    when 'monthly' then (from_date + make_interval(months => t.interval))::date
    when 'yearly' then (from_date + make_interval(years => t.interval))::date
  end
$$;

create function public.on_leave(p_worker uuid, d date) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.leave where worker_id = p_worker and d between from_date and to_date)
$$;

-- Create the occurrences that have fallen due for one household and close
-- ones that were overtaken by a newer occurrence of the same task.
create function public.ensure_occurrences(p_household uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  today date := public.household_today(p_household);
  t public.tasks;
  d date;
  start_d date;
  created int := 0;
  n int;
begin
  for t in select * from public.tasks
           where household_id = p_household and archived_at is null loop
    if t.schedule_kind = 'once' then
      if t.due_date <= today then
        insert into public.occurrences (household_id, task_id, worker_id, due_date)
        values (t.household_id, t.id, t.worker_id, t.due_date)
        on conflict (task_id, due_date) do nothing;
        get diagnostics n = row_count; created := created + n;
      end if;
    elsif t.repeat_from = 'completion' then
      if t.starts_on <= today and not exists (select 1 from public.occurrences where task_id = t.id) then
        insert into public.occurrences (household_id, task_id, worker_id, due_date)
        values (t.household_id, t.id, t.worker_id, t.starts_on)
        on conflict (task_id, due_date) do nothing;
        get diagnostics n = row_count; created := created + n;
      end if;
    else
      -- Look back up to 14 days so a missed nightly run is caught up, but
      -- never before the task existed.
      start_d := greatest(today - 14, t.starts_on,
                          (t.created_at at time zone (select timezone from public.households where id = p_household))::date);
      d := start_d;
      while d <= today loop
        if public.task_due_on(t, d) and not public.on_leave(t.worker_id, d) then
          insert into public.occurrences (household_id, task_id, worker_id, due_date)
          values (t.household_id, t.id, t.worker_id, d)
          on conflict (task_id, due_date) do nothing;
          get diagnostics n = row_count; created := created + n;
        end if;
        d := d + 1;
      end loop;
    end if;
  end loop;

  -- An open occurrence of a fixed-schedule repeat becomes missed once a newer
  -- occurrence of the same task exists.
  update public.occurrences o set status = 'missed'
  from public.tasks tk
  where o.task_id = tk.id and o.household_id = p_household and o.status = 'open'
    and tk.schedule_kind = 'repeat' and tk.repeat_from = 'schedule' and o.attempt = 1
    and exists (select 1 from public.occurrences o2
                where o2.task_id = o.task_id and o2.due_date > o.due_date);
  return created;
end
$$;

create function public.ensure_occurrences_all() returns void
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  for h in select id from public.households loop
    perform public.ensure_occurrences(h);
  end loop;
end
$$;

-- Called by both apps when they open, so the day's tasks exist even if the
-- scheduled job has not run yet.
create function public.refresh_occurrences() returns int
language plpgsql security definer set search_path = public as $$
declare h uuid := public.my_household_id();
begin
  if h is null then return 0; end if;
  return public.ensure_occurrences(h);
end
$$;

-- ---------------------------------------------------------------------------
-- Task triggers: revision history and keeping open occurrences in step
-- ---------------------------------------------------------------------------
create function public.tasks_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.edited_at is distinct from old.edited_at then
    insert into public.task_revisions (task_id, version, snapshot, changed_by, note)
    values (old.id, old.version,
            to_jsonb(old) || jsonb_build_object(
              'media', coalesce((select jsonb_agg(to_jsonb(m) order by m.position)
                                 from public.task_media m where m.task_id = old.id), '[]'::jsonb),
              'steps', coalesce((select jsonb_agg(to_jsonb(s) order by s.position)
                                 from public.task_steps s where s.task_id = old.id), '[]'::jsonb)),
            public.my_member_id(), new.edit_note);
    new.version := old.version + 1;
  end if;
  return new;
end
$$;
create trigger tasks_before_update before update on public.tasks
for each row execute function public.tasks_before_update();

create function public.tasks_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.worker_id is distinct from old.worker_id then
    update public.occurrences set worker_id = new.worker_id
    where task_id = new.id and status = 'open';
  end if;
  if new.archived_at is not null and old.archived_at is null then
    delete from public.occurrences
    where task_id = new.id and status = 'open' and due_date >= public.household_today(new.household_id);
    perform public.log_activity(new.household_id, 'task_archived', new.id, null);
  elsif new.edited_at is distinct from old.edited_at then
    perform public.log_activity(new.household_id, 'task_edited', new.id, null,
                                jsonb_build_object('version', new.version, 'note', new.edit_note));
  end if;
  return null;
end
$$;
create trigger tasks_after_update after update on public.tasks
for each row execute function public.tasks_after_update();

create function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.household_id, 'task_created', new.id, null,
    jsonb_build_object('linked_from', new.linked_from_occurrence_id));
  return null;
end
$$;
create trigger tasks_after_insert after insert on public.tasks
for each row execute function public.tasks_after_insert();

-- ---------------------------------------------------------------------------
-- Worker actions
-- ---------------------------------------------------------------------------
create function public.complete_occurrence(p_id uuid, p_proof_path text default null,
                                           p_steps uuid[] default '{}') returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare
  o public.occurrences;
  t public.tasks;
  me uuid := public.my_member_id();
  local_day date;
  next_d date;
begin
  select * into o from public.occurrences where id = p_id for update;
  if o.id is null or o.household_id is distinct from public.my_household_id() then
    raise exception 'not_found';
  end if;
  if o.worker_id <> me and not public.is_admin() then
    raise exception 'not_allowed';
  end if;
  if o.status = 'done' then
    return o;
  end if;
  if o.status = 'skipped' then
    raise exception 'skipped';
  end if;
  select * into t from public.tasks where id = o.task_id;
  if t.photo_required and coalesce(p_proof_path, '') = '' then
    raise exception 'photo_required';
  end if;

  local_day := public.household_today(o.household_id);
  update public.occurrences set
    status = 'done', done_at = now(), done_by = me, proof_photo_path = p_proof_path,
    steps_done = coalesce(p_steps, '{}'), task_version = t.version,
    done_late = local_day > greatest(o.due_date, coalesce((o.reopened_at at time zone
                  (select timezone from public.households where id = o.household_id))::date, o.due_date)),
    review_status = 'pending', reviewed_by = null, reviewed_at = null
  where id = p_id returning * into o;

  if t.schedule_kind = 'repeat' and t.repeat_from = 'completion' and t.archived_at is null then
    next_d := public.next_floating_date(t, local_day);
    if t.ends_on is null or next_d <= t.ends_on then
      insert into public.occurrences (household_id, task_id, worker_id, due_date, spawned_by)
      values (t.household_id, t.id, t.worker_id, next_d, o.id)
      on conflict (task_id, due_date) do nothing;
    end if;
  end if;

  perform public.log_activity(o.household_id, 'occurrence_done', o.task_id, o.id,
                              jsonb_build_object('late', o.done_late, 'photo', p_proof_path is not null));
  return o;
end
$$;

-- Undo a completion within 15 minutes (the worker app offers 5 seconds).
create function public.undo_completion(p_id uuid) returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare o public.occurrences;
begin
  select * into o from public.occurrences where id = p_id for update;
  if o.id is null or o.household_id is distinct from public.my_household_id() then
    raise exception 'not_found';
  end if;
  if o.worker_id <> public.my_member_id() and not public.is_admin() then
    raise exception 'not_allowed';
  end if;
  if o.status <> 'done' or o.done_at < now() - interval '15 minutes' then
    raise exception 'too_late';
  end if;
  delete from public.occurrences where spawned_by = o.id and status = 'open';
  update public.occurrences set status = 'open', done_at = null, done_late = null, done_by = null,
    proof_photo_path = null, steps_done = '{}', review_status = null
  where id = p_id returning * into o;
  perform public.log_activity(o.household_id, 'occurrence_undone', o.task_id, o.id);
  return o;
end
$$;

-- ---------------------------------------------------------------------------
-- Admin actions: skip, review, reopen
-- ---------------------------------------------------------------------------
create function public.skip_occurrence(p_id uuid, p_reason text default null) returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare o public.occurrences; t public.tasks;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.occurrences set status = 'skipped', skipped_by = public.my_member_id(), skip_reason = p_reason
  where id = p_id and household_id = public.my_household_id() and status in ('open', 'missed')
  returning * into o;
  if o.id is null then raise exception 'not_found'; end if;
  select * into t from public.tasks where id = o.task_id;
  if t.schedule_kind = 'repeat' and t.repeat_from = 'completion' and t.archived_at is null then
    insert into public.occurrences (household_id, task_id, worker_id, due_date, spawned_by)
    values (t.household_id, t.id, t.worker_id,
            public.next_floating_date(t, greatest(o.due_date, public.household_today(o.household_id))), o.id)
    on conflict (task_id, due_date) do nothing;
  end if;
  perform public.log_activity(o.household_id, 'occurrence_skipped', o.task_id, o.id,
                              jsonb_build_object('reason', p_reason));
  return o;
end
$$;

create function public.review_occurrence(p_id uuid, p_decision public.review_status, p_comment text default null)
returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare o public.occurrences;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved', 'flagged') then raise exception 'bad_decision'; end if;
  update public.occurrences set review_status = p_decision, reviewed_by = public.my_member_id(), reviewed_at = now()
  where id = p_id and household_id = public.my_household_id() and status = 'done'
  returning * into o;
  if o.id is null then raise exception 'not_found'; end if;
  if coalesce(p_comment, '') <> '' or p_decision = 'flagged' then
    insert into public.comments (household_id, task_id, occurrence_id, author_id, kind, body)
    values (o.household_id, o.task_id, o.id, public.my_member_id(),
            case p_decision when 'approved' then 'approve' else 'flag' end, coalesce(p_comment, ''));
  end if;
  perform public.log_activity(o.household_id, 'occurrence_' || p_decision::text, o.task_id, o.id,
                              jsonb_build_object('comment', p_comment));
  return o;
end
$$;

-- Send a completed occurrence back to the worker. The earlier completion is
-- kept in occurrence_attempts; requirement changes are kept in task_revisions.
create function public.reopen_occurrence(p_id uuid, p_comment text default null) returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare o public.occurrences;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into o from public.occurrences
  where id = p_id and household_id = public.my_household_id() for update;
  if o.id is null then raise exception 'not_found'; end if;
  if o.status <> 'done' then raise exception 'not_done'; end if;

  insert into public.occurrence_attempts (occurrence_id, attempt, done_at, done_late, proof_photo_path,
                                          task_version, review_status, reviewed_by, reviewed_at)
  values (o.id, o.attempt, o.done_at, o.done_late, o.proof_photo_path, o.task_version,
          coalesce(o.review_status, 'flagged'), coalesce(o.reviewed_by, public.my_member_id()),
          coalesce(o.reviewed_at, now()));

  update public.occurrences set status = 'open', attempt = o.attempt + 1, reopened_at = now(),
    done_at = null, done_late = null, done_by = null, proof_photo_path = null, steps_done = '{}',
    review_status = null, reviewed_by = null, reviewed_at = null
  where id = p_id returning * into o;

  insert into public.comments (household_id, task_id, occurrence_id, author_id, kind, body)
  values (o.household_id, o.task_id, o.id, public.my_member_id(), 'reopen', coalesce(p_comment, ''));
  perform public.log_activity(o.household_id, 'occurrence_reopened', o.task_id, o.id,
                              jsonb_build_object('comment', p_comment, 'attempt', o.attempt));
  return o;
end
$$;

-- ---------------------------------------------------------------------------
-- Households, admins and workers
-- ---------------------------------------------------------------------------
create function public.create_household(p_name text, p_timezone text, p_display_name text)
returns public.members
language plpgsql security definer set search_path = public as $$
declare h uuid; m public.members;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'already_member';
  end if;
  insert into public.households (name, timezone) values (p_name, coalesce(nullif(p_timezone, ''), 'Asia/Kolkata'))
  returning id into h;
  insert into public.members (household_id, user_id, role, display_name, email)
  values (h, auth.uid(), 'owner', p_display_name, (select email from auth.users where id = auth.uid()))
  returning * into m;
  return m;
end
$$;

-- Joins the signed-in user to a household that invited their email.
create function public.accept_invite(p_display_name text default null) returns public.members
language plpgsql security definer set search_path = public as $$
declare inv public.admin_invites; m public.members; em text;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  select * into m from public.members where user_id = auth.uid();
  if m.id is not null then return m; end if;
  select * into inv from public.admin_invites
  where lower(email) = em and accepted_at is null order by created_at limit 1;
  if inv.id is null then return null; end if;
  insert into public.members (household_id, user_id, role, display_name, email)
  values (inv.household_id, auth.uid(), 'admin', coalesce(nullif(p_display_name, ''), split_part(em, '@', 1)), em)
  returning * into m;
  update public.admin_invites set accepted_at = now() where id = inv.id;
  return m;
end
$$;

create function public.set_worker_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.members where id = p_member and role = 'worker'
                 and household_id = public.my_household_id()) then
    raise exception 'not_found';
  end if;
  if p_pin !~ '^[0-8](-[0-8]){3}$' then raise exception 'bad_pin'; end if;
  insert into public.member_secrets (member_id, pin_hash, failed_attempts, locked_until)
  values (p_member, crypt(p_pin, gen_salt('bf')), 0, null)
  on conflict (member_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end
$$;

-- Returns a new sign-in link token for a worker's phone. Any earlier link
-- stops working.
create function public.issue_device_link(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.members where id = p_member and role = 'worker'
                 and household_id = public.my_household_id()) then
    raise exception 'not_found';
  end if;
  insert into public.member_secrets (member_id, device_token_hash)
  values (p_member, encode(digest(tok, 'sha256'), 'hex'))
  on conflict (member_id) do update set device_token_hash = excluded.device_token_hash;
  return tok;
end
$$;

-- Signs the worker out everywhere and cancels their sign-in link.
create function public.revoke_worker_devices(p_member uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select user_id into uid from public.members where id = p_member and role = 'worker'
    and household_id = public.my_household_id();
  if uid is null then raise exception 'not_found'; end if;
  update public.member_secrets set device_token_hash = null where member_id = p_member;
  delete from auth.sessions where user_id = uid;
end
$$;

-- Used only by the worker sign-in endpoint (service role). Returns the
-- worker's login email when the link token and picture PIN match.
create function public.verify_worker_login(p_member uuid, p_token text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s public.member_secrets; em text;
begin
  select * into s from public.member_secrets where member_id = p_member for update;
  if s.member_id is null or s.device_token_hash is null
     or s.device_token_hash <> encode(digest(p_token, 'sha256'), 'hex') then
    raise exception 'bad_link';
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    raise exception 'locked';
  end if;
  if s.pin_hash is null or s.pin_hash <> crypt(p_pin, s.pin_hash) then
    update public.member_secrets set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
    where member_id = p_member;
    raise exception 'bad_pin';
  end if;
  update public.member_secrets set failed_attempts = 0, locked_until = null where member_id = p_member;
  select u.email into em from public.members m join auth.users u on u.id = m.user_id
  where m.id = p_member and m.active;
  if em is null then raise exception 'inactive'; end if;
  return em;
end
$$;

-- Lets the worker sign-in screen show the right face before the PIN.
create function public.worker_link_info(p_member uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  select jsonb_build_object('display_name', m.display_name, 'photo_path', m.photo_path,
                            'household', h.name)
  into r
  from public.members m
  join public.member_secrets s on s.member_id = m.id
  join public.households h on h.id = m.household_id
  where m.id = p_member and m.active
    and s.device_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  return r;
end
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.member_secrets enable row level security;
alter table public.admin_invites enable row level security;
alter table public.labels enable row level security;
alter table public.tasks enable row level security;
alter table public.task_media enable row level security;
alter table public.task_steps enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_revisions enable row level security;
alter table public.occurrences enable row level security;
alter table public.occurrence_attempts enable row level security;
alter table public.comments enable row level security;
alter table public.leave enable row level security;
alter table public.activity enable row level security;

create policy households_read on public.households for select using (id = public.my_household_id());
create policy households_update on public.households for update
  using (id = public.my_household_id() and public.is_admin());

create policy members_read on public.members for select using (household_id = public.my_household_id());
create policy members_update on public.members for update
  using (household_id = public.my_household_id() and public.is_admin()
         and (role = 'worker' or public.is_owner() or user_id = auth.uid()))
  with check (household_id = public.my_household_id()
              and (role <> 'owner' or public.is_owner()));

create policy invites_admin on public.admin_invites for all
  using (household_id = public.my_household_id() and public.is_admin())
  with check (household_id = public.my_household_id() and public.is_admin());

create policy labels_read on public.labels for select using (household_id = public.my_household_id());
create policy labels_admin on public.labels for all
  using (household_id = public.my_household_id() and public.is_admin())
  with check (household_id = public.my_household_id() and public.is_admin());

create policy tasks_read on public.tasks for select
  using (household_id = public.my_household_id() and (public.is_admin() or worker_id = public.my_member_id()));
create policy tasks_admin on public.tasks for all
  using (household_id = public.my_household_id() and public.is_admin())
  with check (household_id = public.my_household_id() and public.is_admin()
              and worker_id in (select id from public.members where household_id = public.my_household_id()));

create function public.can_read_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task
                 and t.household_id = public.my_household_id()
                 and (public.is_admin() or t.worker_id = public.my_member_id()))
$$;
create function public.can_admin_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from public.tasks t where t.id = p_task
                                       and t.household_id = public.my_household_id())
$$;

create policy media_read on public.task_media for select using (public.can_read_task(task_id));
create policy media_admin on public.task_media for all using (public.can_admin_task(task_id))
  with check (public.can_admin_task(task_id));
create policy steps_read on public.task_steps for select using (public.can_read_task(task_id));
create policy steps_admin on public.task_steps for all using (public.can_admin_task(task_id))
  with check (public.can_admin_task(task_id));
create policy task_labels_read on public.task_labels for select using (public.can_read_task(task_id));
create policy task_labels_admin on public.task_labels for all using (public.can_admin_task(task_id))
  with check (public.can_admin_task(task_id));
create policy revisions_read on public.task_revisions for select using (public.can_read_task(task_id));

create policy occ_read on public.occurrences for select
  using (household_id = public.my_household_id() and (public.is_admin() or worker_id = public.my_member_id()));
create policy occ_admin_update on public.occurrences for update
  using (household_id = public.my_household_id() and public.is_admin());

create policy attempts_read on public.occurrence_attempts for select
  using (exists (select 1 from public.occurrences o where o.id = occurrence_id
                 and o.household_id = public.my_household_id()
                 and (public.is_admin() or o.worker_id = public.my_member_id())));

create policy comments_read on public.comments for select using (public.can_read_task(task_id));
create policy comments_insert on public.comments for insert
  with check (household_id = public.my_household_id() and author_id = public.my_member_id()
              and public.can_read_task(task_id));

create policy leave_read on public.leave for select
  using (household_id = public.my_household_id() and (public.is_admin() or worker_id = public.my_member_id()));
create policy leave_admin on public.leave for all
  using (household_id = public.my_household_id() and public.is_admin())
  with check (household_id = public.my_household_id() and public.is_admin());

create policy activity_read on public.activity for select
  using (household_id = public.my_household_id() and public.is_admin());

-- Functions that only the service role may call.
revoke execute on function public.verify_worker_login(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ensure_occurrences(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_occurrences_all() from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.worker_link_info(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket, files grouped by household folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

create policy media_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.my_household_id()::text);
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = public.my_household_id()::text);
