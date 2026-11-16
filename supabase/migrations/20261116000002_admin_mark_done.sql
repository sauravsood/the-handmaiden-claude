-- Lets an admin mark a worker's task as done.
-- complete_occurrence already allowed admins; this changes two things when the
-- caller is not the worker who owns the occurrence:
--   * photo proof is not demanded (the admin is vouching for it), and
--   * the completion is recorded as already approved by that admin, so it
--     does not sit in the review queue.
-- done_by keeps the admin's member id, so history and analytics can tell an
-- admin's tick apart from the worker's own.
create or replace function public.complete_occurrence(p_id uuid, p_proof_path text default null,
                                                      p_steps uuid[] default '{}') returns public.occurrences
language plpgsql security definer set search_path = public as $$
declare
  o public.occurrences;
  t public.tasks;
  me uuid := public.my_member_id();
  by_admin boolean;
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
  by_admin := o.worker_id <> me;
  if o.status = 'done' then
    return o;
  end if;
  if o.status = 'skipped' then
    raise exception 'skipped';
  end if;
  select * into t from public.tasks where id = o.task_id;
  if t.photo_required and coalesce(p_proof_path, '') = '' and not by_admin then
    raise exception 'photo_required';
  end if;

  local_day := public.household_today(o.household_id);
  update public.occurrences set
    status = 'done', done_at = now(), done_by = me, proof_photo_path = nullif(p_proof_path, ''),
    steps_done = coalesce(p_steps, '{}'), task_version = t.version,
    done_late = local_day > greatest(o.due_date, coalesce((o.reopened_at at time zone
                  (select timezone from public.households where id = o.household_id))::date, o.due_date)),
    review_status = case when by_admin then 'approved'::public.review_status else 'pending' end,
    reviewed_by = case when by_admin then me end,
    reviewed_at = case when by_admin then now() end
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
                              jsonb_build_object('late', o.done_late, 'photo', o.proof_photo_path is not null,
                                                 'by_admin', by_admin));
  return o;
end
$$;

-- Undo now also clears the review stamp, which an admin's tick sets.
create or replace function public.undo_completion(p_id uuid) returns public.occurrences
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
    proof_photo_path = null, steps_done = '{}', review_status = null, reviewed_by = null, reviewed_at = null
  where id = p_id returning * into o;
  perform public.log_activity(o.household_id, 'occurrence_undone', o.task_id, o.id);
  return o;
end
$$;
