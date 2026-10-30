import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { describeSchedule, dueDatesBetween, isDueOn, nextFloatingDate } from '../src/lib/schedule';
import type { Schedule } from '../src/lib/types';

const base: Schedule = {
  schedule_kind: 'repeat', due_date: null, freq: 'daily', interval: 1, by_weekday: null,
  by_monthday: null, by_month: null, repeat_from: 'schedule', starts_on: '2026-11-02', ends_on: null,
};

describe('isDueOn', () => {
  it('handles every other day', () => {
    const t = { ...base, interval: 2 };
    expect(isDueOn(t, '2026-11-04')).toBe(true);
    expect(isDueOn(t, '2026-11-03')).toBe(false);
    expect(isDueOn(t, '2026-11-01')).toBe(false);
  });
  it('handles chosen weekdays and fortnights', () => {
    const t: Schedule = { ...base, freq: 'weekly', by_weekday: [1, 4] };
    expect(dueDatesBetween(t, '2026-11-02', '2026-11-08')).toEqual(['2026-11-02', '2026-11-05']);
    const f = { ...t, interval: 2 };
    expect(isDueOn(f, '2026-11-09')).toBe(false);
    expect(isDueOn(f, '2026-11-16')).toBe(true);
  });
  it('clamps the 31st and supports the last day', () => {
    expect(isDueOn({ ...base, freq: 'monthly', by_monthday: [31] }, '2026-11-30')).toBe(true);
    const last = { ...base, freq: 'monthly' as const, by_monthday: [-1] };
    expect(isDueOn(last, '2027-02-28')).toBe(true);
    expect(isDueOn(last, '2027-02-27')).toBe(false);
  });
  it('limits to chosen months', () => {
    const t: Schedule = { ...base, freq: 'monthly', by_monthday: [15], by_month: [3, 9] };
    expect(isDueOn(t, '2026-12-15')).toBe(false);
    expect(isDueOn(t, '2027-03-15')).toBe(true);
  });
  it('handles one-off and end dates', () => {
    expect(isDueOn({ ...base, schedule_kind: 'once', due_date: '2026-12-01' }, '2026-12-01')).toBe(true);
    expect(isDueOn({ ...base, ends_on: '2026-11-03' }, '2026-11-04')).toBe(false);
  });
});

describe('nextFloatingDate', () => {
  it('keeps month ends sensible', () => {
    expect(nextFloatingDate({ ...base, freq: 'monthly' }, '2027-01-31')).toBe('2027-02-28');
    expect(nextFloatingDate({ ...base, freq: 'weekly', interval: 2 }, '2026-11-02')).toBe('2026-11-16');
  });
});

describe('describeSchedule', () => {
  it('reads naturally', () => {
    expect(describeSchedule({ ...base, freq: 'weekly', by_weekday: [4, 1], interval: 2 })).toBe('Every 2 weeks on Mon, Thu');
    expect(describeSchedule({ ...base, freq: 'monthly', by_monthday: [-1] })).toBe('Every month on the last day');
  });
});

// Cross-check against the database version when a local Postgres with the
// migrations applied is available (see supabase/tests/run.sh).
const pg = process.env.PGHOST ? it : it.skip;
describe('parity with SQL', () => {
  pg('matches public.task_due_on for random schedules', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 16807) % 2147483647) % n);
    const pick = <T,>(a: T[]) => a[rnd(a.length)];
    const cases: Schedule[] = [];
    for (let i = 0; i < 60; i++) {
      const freq = pick(['daily', 'weekly', 'monthly', 'yearly'] as const);
      cases.push({
        ...base, freq, interval: 1 + rnd(3),
        starts_on: `2026-${String(1 + rnd(12)).padStart(2, '0')}-${String(1 + rnd(28)).padStart(2, '0')}`,
        by_weekday: freq === 'weekly' && rnd(2) ? [1 + rnd(7), 1 + rnd(7)] : null,
        by_monthday: (freq === 'monthly' || freq === 'yearly') && rnd(2) ? [pick([1, 15, 29, 30, 31, -1])] : null,
        by_month: rnd(4) === 0 ? [1 + rnd(12), 1 + rnd(12)] : null,
      });
    }
    const arr = (a: number[] | null) => (a ? `'{${a.join(',')}}'::smallint[]` : 'null');
    const values = cases.map((c, i) =>
      `(${i}, '${c.freq}', ${c.interval}, '${c.starts_on}'::date, ${arr(c.by_weekday)}, ${arr(c.by_monthday)}, ${arr(c.by_month)})`).join(',');
    const sql = `select c.i, string_agg(d::date::text, ',' order by d) from (values ${values}) c(i, freq, iv, s, bw, bmd, bm)
      cross join generate_series('2026-01-01'::date, '2027-12-31'::date, '1 day') d
      where public.task_due_on(row(null,null,null,'',null,4,'repeat',null,c.freq,c.iv,c.bw,c.bmd,c.bm,'schedule',c.s,null,
        'anytime',null,false,null,null,null,1,null,null,null,null,null)::public.tasks, d::date)
      group by c.i order by c.i`;
    const out = execFileSync('psql', ['-d', 'handmaiden_test', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' });
    const fromSql = new Map(out.trim().split('\n').filter(Boolean).map((l) => l.split('|') as [string, string]));
    cases.forEach((c, i) => {
      expect(dueDatesBetween(c, '2026-01-01', '2027-12-31').join(','), JSON.stringify(c)).toBe(fromSql.get(String(i)) ?? '');
    });
  });
});
