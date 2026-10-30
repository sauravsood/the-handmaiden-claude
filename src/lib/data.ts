import { must, supabase } from './supabase';
import { uploadPhoto } from './media';
import type { Label, Member, Occurrence, Schedule, Task, TaskFull, TimeSlot } from './types';

export const TASK_SELECT = '*, task_media(*), task_steps(*), task_labels(label_id)';

export async function loadMembers(): Promise<Member[]> {
  return must(await supabase.from('members').select('*').order('created_at')) as Member[];
}

export async function loadLabels(): Promise<Label[]> {
  return must(await supabase.from('labels').select('*').order('name')) as Label[];
}

export async function loadTasks(opts: { archived?: boolean } = {}): Promise<TaskFull[]> {
  let q = supabase.from('tasks').select(TASK_SELECT).order('priority').order('title');
  q = opts.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  return sortChildren(must(await q) as TaskFull[]);
}

export async function loadTask(id: string): Promise<TaskFull> {
  return sortChildren([must(await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single()) as TaskFull])[0];
}

function sortChildren(tasks: TaskFull[]): TaskFull[] {
  for (const t of tasks) {
    t.task_media.sort((a, b) => a.position - b.position);
    t.task_steps.sort((a, b) => a.position - b.position);
  }
  return tasks;
}

export async function loadOccurrences(filter: { from?: string; to?: string; workerId?: string; status?: string[]; taskId?: string }) {
  let q = supabase.from('occurrences').select('*').order('due_date', { ascending: false }).limit(5000);
  if (filter.from) q = q.gte('due_date', filter.from);
  if (filter.to) q = q.lte('due_date', filter.to);
  if (filter.workerId) q = q.eq('worker_id', filter.workerId);
  if (filter.taskId) q = q.eq('task_id', filter.taskId);
  if (filter.status) q = q.in('status', filter.status);
  return must(await q) as Occurrence[];
}

export async function refreshOccurrences() {
  await supabase.rpc('refresh_occurrences');
}

export function coverPath(t: TaskFull): string | null {
  return (t.task_media.find((m) => m.kind === 'cover') ?? t.task_media.find((m) => m.kind === 'photo'))?.storage_path ?? null;
}

// ---------------------------------------------------------------------------
// Creating and editing tasks
// ---------------------------------------------------------------------------

/** A photo already stored, or a new one picked on this device. */
export type PhotoRef = { path: string } | { file: File; preview: string };

export interface TaskDraft {
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  time_slot: TimeSlot;
  exact_time: string;
  photo_required: boolean;
  schedule: Schedule;
  workerIds: string[];
  labelIds: string[];
  cover: PhotoRef | null;
  photos: PhotoRef[];
  steps: { label: string; photo: PhotoRef | null }[];
  linked_from_occurrence_id: string | null;
  link_reason: string;
}

export function draftFromTask(t: TaskFull): TaskDraft {
  const media = (p: string): PhotoRef => ({ path: p });
  const cover = t.task_media.find((m) => m.kind === 'cover');
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    time_slot: t.time_slot,
    exact_time: t.exact_time?.slice(0, 5) ?? '',
    photo_required: t.photo_required,
    schedule: {
      schedule_kind: t.schedule_kind, due_date: t.due_date, freq: t.freq, interval: t.interval,
      by_weekday: t.by_weekday, by_monthday: t.by_monthday, by_month: t.by_month,
      repeat_from: t.repeat_from, starts_on: t.starts_on, ends_on: t.ends_on,
    },
    workerIds: [t.worker_id],
    labelIds: t.task_labels.map((l) => l.label_id),
    cover: cover ? media(cover.storage_path) : null,
    photos: t.task_media.filter((m) => m.kind === 'photo').map((m) => media(m.storage_path)),
    steps: t.task_steps.map((s) => ({ label: s.label, photo: s.photo_path ? media(s.photo_path) : null })),
    linked_from_occurrence_id: t.linked_from_occurrence_id,
    link_reason: t.link_reason ?? '',
  };
}

async function resolvePhoto(householdId: string, p: PhotoRef | null): Promise<string | null> {
  if (!p) return null;
  if ('path' in p) return p.path;
  return uploadPhoto(householdId, 'tasks', p.file);
}

function taskColumns(d: TaskDraft) {
  const s = d.schedule;
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    priority: d.priority,
    time_slot: d.time_slot,
    exact_time: d.exact_time || null,
    photo_required: d.photo_required,
    schedule_kind: s.schedule_kind,
    due_date: s.schedule_kind === 'once' ? s.due_date : null,
    freq: s.schedule_kind === 'repeat' ? s.freq : null,
    interval: s.interval,
    by_weekday: s.schedule_kind === 'repeat' && s.freq === 'weekly' && s.by_weekday?.length ? s.by_weekday : null,
    by_monthday: s.schedule_kind === 'repeat' && (s.freq === 'monthly' || s.freq === 'yearly') && s.by_monthday?.length ? s.by_monthday : null,
    by_month: s.schedule_kind === 'repeat' && s.by_month?.length ? s.by_month : null,
    repeat_from: s.repeat_from,
    starts_on: s.schedule_kind === 'once' ? (s.due_date ?? s.starts_on) : s.starts_on,
    ends_on: s.schedule_kind === 'repeat' ? s.ends_on || null : null,
  };
}

async function writeChildren(taskIds: string[], d: TaskDraft, paths: { cover: string | null; photos: string[]; steps: (string | null)[] }) {
  must(await supabase.from('task_media').delete().in('task_id', taskIds).in('kind', ['cover', 'photo']));
  must(await supabase.from('task_steps').delete().in('task_id', taskIds));
  must(await supabase.from('task_labels').delete().in('task_id', taskIds));
  const media = taskIds.flatMap((task_id) => [
    ...(paths.cover ? [{ task_id, kind: 'cover', storage_path: paths.cover, position: 0 }] : []),
    ...paths.photos.map((storage_path, i) => ({ task_id, kind: 'photo', storage_path, position: i + 1 })),
  ]);
  const steps = taskIds.flatMap((task_id) =>
    d.steps.map((s, i) => ({ task_id, position: i, label: s.label.trim(), photo_path: paths.steps[i] })));
  const labels = taskIds.flatMap((task_id) => d.labelIds.map((label_id) => ({ task_id, label_id })));
  if (media.length) must(await supabase.from('task_media').insert(media));
  if (steps.length) must(await supabase.from('task_steps').insert(steps));
  if (labels.length) must(await supabase.from('task_labels').insert(labels));
}

async function uploadAll(householdId: string, d: TaskDraft) {
  return {
    cover: await resolvePhoto(householdId, d.cover),
    photos: (await Promise.all(d.photos.map((p) => resolvePhoto(householdId, p)))).filter((p): p is string => !!p),
    steps: await Promise.all(d.steps.map((s) => resolvePhoto(householdId, s.photo))),
  };
}

/** Creates one independent task per chosen worker. Returns the new task ids. */
export async function createTasks(householdId: string, me: Member, d: TaskDraft): Promise<string[]> {
  const paths = await uploadAll(householdId, d);
  const group = d.workerIds.length > 1 ? crypto.randomUUID() : null;
  const rows = d.workerIds.map((worker_id) => ({
    ...taskColumns(d), household_id: householdId, worker_id, copy_group_id: group, created_by: me.id,
    linked_from_occurrence_id: d.linked_from_occurrence_id, link_reason: d.link_reason.trim() || null,
  }));
  const created = must(await supabase.from('tasks').insert(rows).select('id')) as { id: string }[];
  const ids = created.map((r) => r.id);
  await writeChildren(ids, d, paths);
  await refreshOccurrences();
  return ids;
}

/**
 * Saves edits. The task row is updated first so the database keeps a
 * snapshot of the previous version, photos and steps included.
 */
export async function updateTasks(householdId: string, taskIds: string[], d: TaskDraft, note: string, workerId?: string) {
  const paths = await uploadAll(householdId, d);
  const cols = { ...taskColumns(d), edited_at: new Date().toISOString(), edit_note: note.trim() || null };
  must(await supabase.from('tasks').update(workerId ? { ...cols, worker_id: workerId } : cols).in('id', taskIds));
  await writeChildren(taskIds, d, paths);
  await refreshOccurrences();
}

export async function archiveTask(id: string) {
  must(await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export async function restoreTask(id: string) {
  must(await supabase.from('tasks').update({ archived_at: null }).eq('id', id));
  await refreshOccurrences();
}

export function emptyDraft(today: string): TaskDraft {
  return {
    title: '', description: '', priority: 4, time_slot: 'anytime', exact_time: '', photo_required: false,
    schedule: {
      schedule_kind: 'repeat', due_date: today, freq: 'daily', interval: 1, by_weekday: null, by_monthday: null,
      by_month: null, repeat_from: 'schedule', starts_on: today, ends_on: null,
    },
    workerIds: [], labelIds: [], cover: null, photos: [], steps: [],
    linked_from_occurrence_id: null, link_reason: '',
  };
}

export type { Task };
