import { addDays, describeSchedule, dueDatesBetween, formatDay, monthName, nextFloatingDate, weekdayName } from '../lib/schedule';
import type { Freq, Schedule } from '../lib/types';

const PRESETS: { label: string; apply: (s: Schedule) => Partial<Schedule> }[] = [
  { label: 'Daily', apply: () => ({ freq: 'daily', interval: 1, by_weekday: null, by_monthday: null }) },
  { label: 'Weekdays', apply: () => ({ freq: 'weekly', interval: 1, by_weekday: [1, 2, 3, 4, 5] }) },
  { label: 'Mon to Sat', apply: () => ({ freq: 'weekly', interval: 1, by_weekday: [1, 2, 3, 4, 5, 6] }) },
  { label: 'Weekly', apply: () => ({ freq: 'weekly', interval: 1, by_weekday: null }) },
  { label: 'Every 2 weeks', apply: () => ({ freq: 'weekly', interval: 2, by_weekday: null }) },
  { label: 'Monthly', apply: () => ({ freq: 'monthly', interval: 1, by_monthday: null }) },
];

function toggle(list: number[] | null, v: number): number[] {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v].sort((a, b) => a - b);
}

export function SchedulePicker({ value, onChange, today }: { value: Schedule; onChange: (s: Schedule) => void; today: string }) {
  const s = value;
  const set = (p: Partial<Schedule>) => onChange({ ...s, ...p });
  const preview = s.schedule_kind === 'repeat'
    ? s.repeat_from === 'completion'
      ? [s.starts_on, nextFloatingDate(s, s.starts_on)]
      : dueDatesBetween(s, s.starts_on > today ? s.starts_on : today, addDays(today, 400)).slice(0, 5)
    : [];

  return (
    <div className="stack">
      <div className="chips" role="radiogroup" aria-label="How often">
        <button type="button" className={`chip${s.schedule_kind === 'repeat' ? ' on' : ''}`} onClick={() => set({ schedule_kind: 'repeat' })}>Repeats</button>
        <button type="button" className={`chip${s.schedule_kind === 'once' ? ' on' : ''}`} onClick={() => set({ schedule_kind: 'once', due_date: s.due_date ?? today })}>One-off</button>
      </div>

      {s.schedule_kind === 'once' ? (
        <label className="field"><span>Date</span>
          <input id="sch-date" type="date" required value={s.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value })} />
        </label>
      ) : (
        <>
          <div className="chips" aria-label="Presets">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className="chip" onClick={() => set({ ...p.apply(s), repeat_from: 'schedule' })}>{p.label}</button>
            ))}
          </div>
          <div className="row">
            <span>Every</span>
            <input id="sch-interval" type="number" min={1} max={99} style={{ width: 70 }} value={s.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
            <select id="sch-freq" style={{ width: 'auto' }} value={s.freq ?? 'daily'} onChange={(e) => set({ freq: e.target.value as Freq })}>
              <option value="daily">{s.interval > 1 ? 'days' : 'day'}</option>
              <option value="weekly">{s.interval > 1 ? 'weeks' : 'week'}</option>
              <option value="monthly">{s.interval > 1 ? 'months' : 'month'}</option>
              <option value="yearly">{s.interval > 1 ? 'years' : 'year'}</option>
            </select>
          </div>

          <div className="chips" role="radiogroup" aria-label="Count from">
            <button type="button" className={`chip${s.repeat_from === 'schedule' ? ' on' : ''}`} onClick={() => set({ repeat_from: 'schedule' })}>On fixed dates</button>
            <button type="button" className={`chip${s.repeat_from === 'completion' ? ' on' : ''}`} onClick={() => set({ repeat_from: 'completion' })}>Counted from when it's done</button>
          </div>

          {s.repeat_from === 'schedule' && s.freq === 'weekly' && (
            <div className="stack" style={{ gap: 6 }}>
              <small>On these days (none chosen = same weekday as the start date)</small>
              <div className="chips">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button key={d} type="button" className={`chip${s.by_weekday?.includes(d) ? ' on' : ''}`}
                    onClick={() => set({ by_weekday: toggle(s.by_weekday, d) })}>{weekdayName(d)}</button>
                ))}
              </div>
            </div>
          )}

          {s.repeat_from === 'schedule' && (s.freq === 'monthly' || s.freq === 'yearly') && (
            <div className="stack" style={{ gap: 6 }}>
              <small>On these days of the month (none chosen = same day as the start date)</small>
              <div className="chips">
                {Array.from({ length: 31 }, (_, i) => i + 1).concat(-1).map((d) => (
                  <button key={d} type="button" className={`chip${s.by_monthday?.includes(d) ? ' on' : ''}`}
                    onClick={() => set({ by_monthday: toggle(s.by_monthday, d) })}>{d === -1 ? 'Last' : d}</button>
                ))}
              </div>
            </div>
          )}

          {s.repeat_from === 'schedule' && (
            <details>
              <summary className="muted">Only in certain months</summary>
              <div className="chips" style={{ marginTop: 8 }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button key={m} type="button" className={`chip${s.by_month?.includes(m) ? ' on' : ''}`}
                    onClick={() => set({ by_month: toggle(s.by_month, m) })}>{monthName(m)}</button>
                ))}
              </div>
            </details>
          )}

          <div className="grid2">
            <label className="field"><span>Starts</span>
              <input id="sch-start" type="date" required value={s.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
            </label>
            <label className="field"><span>Ends (optional)</span>
              <input id="sch-end" type="date" value={s.ends_on ?? ''} onChange={(e) => set({ ends_on: e.target.value || null })} />
            </label>
          </div>
        </>
      )}

      <div className="notice">
        <strong>{describeSchedule(s)}</strong>
        {preview.length > 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            {s.repeat_from === 'completion' && s.schedule_kind === 'repeat'
              ? `First on ${formatDay(preview[0])}, then counted from each completion.`
              : `Next: ${preview.map(formatDay).join(' · ')}`}
          </div>
        )}
        {s.schedule_kind === 'repeat' && s.repeat_from === 'schedule' && preview.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>No dates fall in the next year with these settings.</div>
        )}
      </div>
    </div>
  );
}
