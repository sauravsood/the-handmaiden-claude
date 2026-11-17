import { formatDay } from '../lib/schedule';
import type { Occurrence, Task } from '../lib/types';

/** What the Tasks list shows for a task, based on its current or latest occurrence. */
export type TaskStatusKey =
  | 'overdue' | 'redo' | 'todo' | 'review' | 'flagged' | 'done' | 'skipped' | 'missed' | 'upcoming' | 'none';

export interface TaskStatus {
  key: TaskStatusKey;
  label: string;
  /** Pill colour class. */
  tone: '' | 'good' | 'warn' | 'bad' | 'accent' | 'review';
  /** Short extra text, such as the due date or who ticked it. */
  detail?: string;
  /** The occurrence the status comes from, if any. */
  occurrence?: Occurrence;
}

/** Order and names for the status filter. */
export const STATUS_FILTERS: { key: TaskStatusKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'todo', label: 'To do' },
  { key: 'redo', label: 'Sent back' },
  { key: 'review', label: 'Awaiting review' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'done', label: 'Done' },
  { key: 'missed', label: 'Missed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'none', label: 'Nothing scheduled' },
];

/**
 * Status of a task today. For a repeating task this is the status of today's
 * occurrence (or the latest one before today); any open occurrence before today
 * makes it overdue. A task with only future occurrences is upcoming.
 * `occs` are this task's occurrences, in any order.
 */
export function taskStatus(task: Pick<Task, 'worker_id'>, occs: Occurrence[], today: string): TaskStatus {
  const sorted = [...occs].sort((a, b) => b.due_date.localeCompare(a.due_date)); // newest first
  const next = [...sorted].reverse().find((o) => o.due_date > today && o.status === 'open');
  const nextText = next ? `next ${formatDay(next.due_date)}` : undefined;

  const overdue = sorted.filter((o) => o.status === 'open' && o.due_date < today);
  if (overdue.length) {
    const oldest = overdue[overdue.length - 1];
    return {
      key: 'overdue', label: 'Overdue', tone: 'bad', occurrence: oldest,
      detail: overdue.length > 1 ? `${overdue.length} overdue, since ${formatDay(oldest.due_date)}` : `was due ${formatDay(oldest.due_date)}`,
    };
  }

  // Today's occurrence, or a "this week / this month" one that can be done now.
  const current = sorted.find((o) => o.due_date === today)
    ?? [...sorted].reverse().find((o) => o.flexible && o.status === 'open' && o.due_date > today)
    ?? sorted.find((o) => o.due_date < today);

  if (!current) {
    if (next) return { key: 'upcoming', label: 'Upcoming', tone: '', detail: formatDay(next.due_date), occurrence: next };
    return { key: 'none', label: 'Nothing scheduled', tone: '' };
  }

  const when = current.due_date === today ? 'today'
    : current.due_date > today ? `by ${formatDay(current.due_date)}` : formatDay(current.due_date);
  const withNext = (s: string) => (nextText && current.due_date <= today ? `${s} · ${nextText}` : s);

  switch (current.status) {
    case 'open':
      return current.attempt > 1
        ? { key: 'redo', label: 'Sent back', tone: 'warn', detail: `redo ${when}`, occurrence: current }
        : { key: 'todo', label: 'To do', tone: 'accent', detail: when, occurrence: current };
    case 'skipped':
      return { key: 'skipped', label: 'Skipped', tone: '', detail: withNext(when), occurrence: current };
    case 'missed':
      return { key: 'missed', label: 'Missed', tone: 'bad', detail: withNext(when), occurrence: current };
    case 'done': {
      const byAdmin = !!current.done_by && current.done_by !== task.worker_id;
      const parts = [when, byAdmin ? 'marked by an admin' : current.done_late ? 'late' : ''].filter(Boolean).join(', ');
      if (current.review_status === 'flagged') return { key: 'flagged', label: 'Flagged', tone: 'bad', detail: withNext(parts), occurrence: current };
      if (current.review_status === 'pending') return { key: 'review', label: 'Awaiting review', tone: 'review', detail: withNext(parts), occurrence: current };
      return { key: 'done', label: 'Done', tone: 'good', detail: withNext(parts), occurrence: current };
    }
  }
}
