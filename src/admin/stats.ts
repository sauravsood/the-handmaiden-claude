import { addDays, daysBetween } from '../lib/schedule';
import { localDateOf, localHourOf } from '../lib/dates';
import type { Occurrence } from '../lib/types';

export interface Stats {
  /** Occurrences whose day has passed or that were completed. */
  due: number;
  done: number;
  onTime: number;
  late: number;
  missed: number;
  overdue: number;
  skipped: number;
  flagged: number;
  approved: number;
  reopened: number;
  withPhoto: number;
  completionRate: number | null;
  onTimeRate: number | null;
  avgDelayDays: number | null;
  streak: number;
  byHour: number[];
}

/** Counts an occurrence as due once its day is over, or once it is done. */
export function isCountable(o: Occurrence, today: string) {
  return o.status === 'done' || o.status === 'missed' || (o.status === 'open' && o.due_date < today);
}

export function computeStats(occ: Occurrence[], today: string, tz: string): Stats {
  const s: Stats = {
    due: 0, done: 0, onTime: 0, late: 0, missed: 0, overdue: 0, skipped: 0, flagged: 0, approved: 0,
    reopened: 0, withPhoto: 0, completionRate: null, onTimeRate: null, avgDelayDays: null, streak: 0,
    byHour: Array(24).fill(0),
  };
  let delaySum = 0;
  for (const o of occ) {
    s.reopened += Math.max(0, o.attempt - 1);
    if (o.status === 'skipped') { s.skipped++; continue; }
    if (!isCountable(o, today)) continue;
    s.due++;
    if (o.status === 'done') {
      s.done++;
      if (o.done_late) {
        s.late++;
        delaySum += Math.max(0, daysBetween(o.due_date, localDateOf(o.done_at!, tz)));
      } else s.onTime++;
      if (o.review_status === 'flagged') s.flagged++;
      if (o.review_status === 'approved') s.approved++;
      if (o.proof_photo_path) s.withPhoto++;
      if (o.done_at) s.byHour[localHourOf(o.done_at, tz)]++;
    } else if (o.status === 'missed') s.missed++;
    else s.overdue++;
  }
  s.completionRate = s.due ? s.done / s.due : null;
  s.onTimeRate = s.done ? s.onTime / s.done : null;
  s.avgDelayDays = s.late ? delaySum / s.late : null;
  s.streak = streak(occ, today);
  return s;
}

/** Consecutive days with tasks, counting back from yesterday, on which every task was done on time. */
function streak(occ: Occurrence[], today: string): number {
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occ) if (o.status !== 'skipped' && o.due_date < today) byDay.set(o.due_date, [...(byDay.get(o.due_date) ?? []), o]);
  let n = 0;
  for (const d of [...byDay.keys()].sort().reverse()) {
    if (byDay.get(d)!.every((o) => o.status === 'done' && !o.done_late)) n++;
    else break;
  }
  return n;
}

export function dailySeries(occ: Occurrence[], from: string, to: string, today: string) {
  const days: { day: string; done: number; late: number; notDone: number }[] = [];
  const idx = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) { idx.set(d, days.length); days.push({ day: d, done: 0, late: 0, notDone: 0 }); }
  for (const o of occ) {
    const i = idx.get(o.due_date);
    if (i === undefined || !isCountable(o, today)) continue;
    if (o.status === 'done') { if (o.done_late) days[i].late++; else days[i].done++; }
    else days[i].notDone++;
  }
  return days;
}

export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
