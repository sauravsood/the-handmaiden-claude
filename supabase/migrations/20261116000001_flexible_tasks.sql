-- "This week" / "This month" tasks: a one-off task the worker can do on any
-- day from starts_on up to due_date. Its occurrence appears on starts_on with
-- due_date set to the last day, so it only counts as late or overdue after
-- that day.

alter table public.tasks add column if not exists flexible boolean not null default false;
alter table public.occurrences add column if not exists flexible boolean not null default false;

-- Same as before, except flexible one-off tasks appear from their start day.
create or replace function public.ensure_occurrences(p_household uuid) returns int
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
      if (case when t.flexible then least(t.starts_on, t.due_date) else t.due_date end) <= today then
        insert into public.occurrences (household_id, task_id, worker_id, due_date, flexible)
        values (t.household_id, t.id, t.worker_id, t.due_date, t.flexible)
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

-- Same as before, plus: when a one-off task's date or kind changes, its open
-- occurrence moves with it instead of a second copy appearing.
create or replace function public.tasks_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.worker_id is distinct from old.worker_id then
    update public.occurrences set worker_id = new.worker_id
    where task_id = new.id and status = 'open';
  end if;
  if new.schedule_kind = 'once' and old.schedule_kind = 'once'
     and (new.due_date is distinct from old.due_date or new.flexible is distinct from old.flexible) then
    update public.occurrences set due_date = new.due_date, flexible = new.flexible
    where task_id = new.id and status = 'open'
      and not exists (select 1 from public.occurrences o2 where o2.task_id = new.id and o2.due_date = new.due_date);
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
