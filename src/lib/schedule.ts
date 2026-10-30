// Schedule rules. Mirrors public.task_due_on in the database migration;
// keep the two in step.
import type { Schedule } from './types';

/** Parses YYYY-MM-DD as a calendar date (UTC midnight, no time zone drift). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(s: string): number {
  const w = parseDate(s).getUTCDay();
  return w === 0 ? 7 : w;
}

function weekStart(s: string): string {
  return addDays(s, 1 - isoWeekday(s));
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const nonEmpty = (a: number[] | null | undefined): a is number[] => !!a && a.length > 0;

export function isDueOn(t: Schedule, d: string): boolean {
  if (d < t.starts_on || (t.ends_on && d > t.ends_on)) return false;
  if (t.schedule_kind === 'once') return d === t.due_date;
  if (t.repeat_from === 'completion') return false;

  const [y, m, dom] = d.split('-').map(Number);
  const [sy, sm, sd] = t.starts_on.split('-').map(Number);
  if (nonEmpty(t.by_month) && !t.by_month.includes(m)) return false;

  switch (t.freq) {
    case 'daily':
      return daysBetween(t.starts_on, d) % t.interval === 0;
    case 'weekly': {
      const days = nonEmpty(t.by_weekday) ? t.by_weekday : [isoWeekday(t.starts_on)];
      if (!days.includes(isoWeekday(d))) return false;
      return (daysBetween(weekStart(t.starts_on), weekStart(d)) / 7) % t.interval === 0;
    }
    case 'monthly':
    case 'yearly': {
      const months = y * 12 + m - (sy * 12 + sm);
      if (t.freq === 'monthly' && months % t.interval !== 0) return false;
      if (t.freq === 'yearly') {
        if (!nonEmpty(t.by_month) && m !== sm) return false;
        if ((y - sy) % t.interval !== 0) return false;
      }
      const last = daysInMonth(y, m);
      const mdays = nonEmpty(t.by_monthday) ? t.by_monthday : [sd];
      return mdays.some((md) => (md === -1 && dom === last) || md === dom || (md > last && dom === last));
    }
    default:
      return false;
  }
}

/** Next due date for a "repeat from completion" task. */
export function nextFloatingDate(t: Schedule, from: string): string {
  const d = parseDate(from);
  switch (t.freq) {
    case 'daily':
      return addDays(from, t.interval);
    case 'weekly':
      return addDays(from, 7 * t.interval);
    case 'monthly':
    case 'yearly': {
      const months = t.freq === 'monthly' ? t.interval : 12 * t.interval;
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + months;
      const target = new Date(Date.UTC(y, m, 1));
      const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
      target.setUTCDate(Math.min(d.getUTCDate(), last));
      return formatISO(target);
    }
    default:
      return from;
  }
}

/** Fixed-schedule due dates in [from, to]. Floating tasks are not projected. */
export function dueDatesBetween(t: Schedule, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isDueOn(t, d)) out.push(d);
  return out;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekdayName = (n: number) => WEEKDAYS[n - 1];
export const monthName = (n: number) => MONTHS[n - 1];

function ordinal(n: number): string {
  if (n === -1) return 'last day';
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

export function formatDay(s: string): string {
  const d = parseDate(s);
  return `${WEEKDAYS[isoWeekday(s) - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Plain-English summary, e.g. "Every 2 weeks on Mon, Thu". */
export function describeSchedule(t: Schedule): string {
  if (t.schedule_kind === 'once') return t.due_date ? `Once on ${formatDay(t.due_date)}` : 'Once';
  const n = t.interval;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[t.freq ?? 'daily'];
  let s = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (t.freq === 'daily' && n === 1) s = 'Daily';
  if (t.repeat_from === 'completion') return `${s} after it's done`;
  if (t.freq === 'weekly') {
    const days = nonEmpty(t.by_weekday) ? t.by_weekday : [isoWeekday(t.starts_on)];
    s += ` on ${[...days].sort().map(weekdayName).join(', ')}`;
  }
  if (t.freq === 'monthly' || t.freq === 'yearly') {
    const md = nonEmpty(t.by_monthday) ? t.by_monthday : [Number(t.starts_on.slice(8))];
    s += ` on the ${md.map(ordinal).join(', ')}`;
  }
  if (nonEmpty(t.by_month)) s += ` in ${[...t.by_month].sort((a, b) => a - b).map(monthName).join(', ')}`;
  else if (t.freq === 'yearly') s += ` of ${monthName(Number(t.starts_on.slice(5, 7)))}`;
  if (t.ends_on) s += `, until ${formatDay(t.ends_on)}`;
  return s;
}
