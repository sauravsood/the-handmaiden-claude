import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '../auth';
import { loadLabels, loadMembers, loadOccurrences, loadTasks } from '../lib/data';
import { addDays, formatDateTime, localDateOf, todayIn } from '../lib/dates';
import { formatDay } from '../lib/schedule';
import { useAsync } from '../lib/useAsync';
import type { Occurrence } from '../lib/types';
import { Avatar, ErrorBox, Loading, Photo } from '../components/ui';
import { computeStats, dailySeries, pct } from './stats';

const RANGES = [7, 30, 90, 365];

export function AnalyticsPage() {
  const { household } = useMe();
  const tz = household.timezone;
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days') ?? 30);
  const worker = params.get('worker') ?? '';
  const label = params.get('label') ?? '';
  const from = addDays(today, -(days - 1));
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const d = useAsync(async () => {
    const [occ, tasks, archived, members, labels] = await Promise.all([
      loadOccurrences({ from, to: today }), loadTasks(), loadTasks({ archived: true }), loadMembers(), loadLabels(),
    ]);
    return { occ, tasks: new Map([...tasks, ...archived].map((t) => [t.id, t])), members, labels };
  }, [from, today]);

  const filtered = useMemo(() => {
    if (!d.data) return [] as Occurrence[];
    return d.data.occ.filter((o) => {
      const t = d.data!.tasks.get(o.task_id);
      return (!worker || o.worker_id === worker) && (!label || t?.task_labels.some((l) => l.label_id === label));
    });
  }, [d.data, worker, label]);

  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { tasks, members, labels } = d.data;
  const workers = members.filter((m) => m.role === 'worker');
  const s = computeStats(filtered, today, tz);
  const series = dailySeries(filtered, from, today, today);

  const perWorker = workers.filter((w) => !worker || w.id === worker).map((w) => {
    const mine = filtered.filter((o) => o.worker_id === w.id);
    return { w, s: computeStats(mine, today, tz), perDay: mine.length / days };
  });
  const perTask = [...groupBy(filtered, (o) => o.task_id).entries()].map(([taskId, list]) => {
    const t = tasks.get(taskId);
    const st = computeStats(list, today, tz);
    const lastDone = list.filter((o) => o.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!))[0]?.done_at ?? null;
    return { taskId, t, st, lastDone };
  }).sort((a, b) => (a.st.completionRate ?? 1) - (b.st.completionRate ?? 1));
  const proofs = filtered.filter((o) => o.proof_photo_path).sort((a, b) => b.done_at!.localeCompare(a.done_at!)).slice(0, 48);

  const exportCsv = () => {
    const name = new Map(members.map((m) => [m.id, m.display_name]));
    const rows = [['due_date', 'task', 'worker', 'status', 'done_at', 'late', 'review', 'attempt', 'photo']];
    for (const o of filtered) rows.push([
      o.due_date, tasks.get(o.task_id)?.title ?? '', name.get(o.worker_id) ?? '', o.status,
      o.done_at ? formatDateTime(o.done_at, tz) : '', o.done_late ? 'yes' : '', o.review_status ?? '', String(o.attempt), o.proof_photo_path ? 'yes' : '',
    ]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `handmaiden-${from}-to-${today}.csv`;
    a.click();
  };

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Analytics</h1>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="row">
        <div className="chips">
          {RANGES.map((r) => <button key={r} className={`chip${r === days ? ' on' : ''}`} onClick={() => setParam('days', String(r))}>Last {r} days</button>)}
        </div>
        <select id="an-worker" style={{ width: 'auto' }} value={worker} onChange={(e) => setParam('worker', e.target.value)}>
          <option value="">All workers</option>
          {workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}
        </select>
        <select id="an-label" style={{ width: 'auto' }} value={label} onChange={(e) => setParam('label', e.target.value)}>
          <option value="">All labels</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="stat-row">
        <div className="stat"><div className="v">{pct(s.completionRate)}</div><div className="l">Completed ({s.done} of {s.due})</div></div>
        <div className="stat"><div className="v">{pct(s.onTimeRate)}</div><div className="l">On time</div></div>
        <div className="stat"><div className="v">{s.missed + s.overdue}</div><div className="l">Missed or overdue</div></div>
        <div className="stat"><div className="v">{s.flagged}</div><div className="l">Flagged as unsatisfactory</div></div>
        <div className="stat"><div className="v">{s.reopened}</div><div className="l">Sent back for a redo</div></div>
        <div className="stat"><div className="v">{s.avgDelayDays === null ? '–' : `${s.avgDelayDays.toFixed(1)} d`}</div><div className="l">Average delay when late</div></div>
      </div>

      <section className="card stack">
        <h2>Completion by day</h2>
        <DailyChart series={series} />
        <div className="row" style={{ fontSize: 13 }}>
          <Legend color="var(--good)" label="On time" /><Legend color="var(--warm)" label="Late" /><Legend color="var(--bad)" label="Not done" />
        </div>
      </section>

      <section className="stack">
        <h2>By worker</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Worker</th><th className="num">Due</th><th className="num">Done</th><th className="num">On time</th><th className="num">Missed</th><th className="num">Skipped</th><th className="num">Flagged</th><th className="num">Redos</th><th className="num">Avg delay</th><th className="num">Streak</th><th className="num">Tasks / day</th></tr></thead>
            <tbody>
              {perWorker.map(({ w, s: ws, perDay }) => (
                <tr key={w.id}>
                  <td><Link to={`/admin/people/${w.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar member={w} size={24} /> {w.display_name}</Link></td>
                  <td className="num">{ws.due}</td>
                  <td className="num">{ws.done} <small>{pct(ws.completionRate)}</small></td>
                  <td className="num">{pct(ws.onTimeRate)}</td>
                  <td className="num">{ws.missed + ws.overdue}</td>
                  <td className="num">{ws.skipped}</td>
                  <td className="num">{ws.flagged}</td>
                  <td className="num">{ws.reopened}</td>
                  <td className="num">{ws.avgDelayDays === null ? '–' : `${ws.avgDelayDays.toFixed(1)} d`}</td>
                  <td className="num">{ws.streak}</td>
                  <td className="num">{perDay.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2>When tasks get done</h2>
        <HourChart byHour={s.byHour} />
      </section>

      <section className="stack">
        <h2>Task health</h2>
        <p className="muted">Lowest completion first.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Worker</th><th className="num">Due</th><th className="num">Done</th><th className="num">On time</th><th className="num">Flagged</th><th>Last done</th></tr></thead>
            <tbody>
              {perTask.map(({ taskId, t, st, lastDone }) => (
                <tr key={taskId}>
                  <td><Link to={`/admin/tasks/${taskId}`}>{t?.title ?? 'Deleted task'}</Link></td>
                  <td>{members.find((m) => m.id === t?.worker_id)?.display_name}</td>
                  <td className="num">{st.due}</td>
                  <td className="num">{pct(st.completionRate)}</td>
                  <td className="num">{pct(st.onTimeRate)}</td>
                  <td className="num">{st.flagged}</td>
                  <td>{lastDone ? formatDay(localDateOf(lastDone, tz)) : 'never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>Photo proof</h2>
        {proofs.length === 0 ? <p className="muted">No proof photos in this period.</p> : (
          <div className="gallery">
            {proofs.map((o) => (
              <Link key={o.id} to={`/admin/occurrences/${o.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <figure>
                  <Photo path={o.proof_photo_path} fallback="📷" />
                  <figcaption>{tasks.get(o.task_id)?.title}<br /><small>{formatDateTime(o.done_at!, tz)}</small></figcaption>
                </figure>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{label}</span>;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

function DailyChart({ series }: { series: { day: string; done: number; late: number; notDone: number }[] }) {
  const W = 760, H = 200, L = 32, B = 22, T = 8;
  const max = niceMax(Math.max(1, ...series.map((s) => s.done + s.late + s.notDone)));
  const bw = (W - L - 8) / series.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(series.length / 8);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }} role="img" aria-label="Tasks completed per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = L + i * bw + bw * 0.15;
          const w = Math.max(1, bw * 0.7);
          const h1 = y(0) - y(s.done), h2 = y(0) - y(s.late), h3 = y(0) - y(s.notDone);
          return (
            <g key={s.day}>
              <title>{`${formatDay(s.day)}: ${s.done} on time, ${s.late} late, ${s.notDone} not done`}</title>
              <rect x={x} y={y(0) - h1} width={w} height={h1} fill="var(--good)" />
              <rect x={x} y={y(0) - h1 - h2} width={w} height={h2} fill="var(--warm)" />
              <rect x={x} y={y(0) - h1 - h2 - h3} width={w} height={h3} fill="var(--bad)" />
              {i % labelEvery === 0 && <text x={x + w / 2} y={H - 6} textAnchor="middle">{formatDay(s.day).slice(4)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HourChart({ byHour }: { byHour: number[] }) {
  const W = 760, H = 140, L = 8, B = 20;
  const max = Math.max(1, ...byHour);
  const bw = (W - 2 * L) / 24;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }} role="img" aria-label="Completions by hour of day">
        {byHour.map((v, h) => {
          const bh = (H - B - 8) * (v / max);
          return (
            <g key={h}>
              <title>{`${h}:00 to ${h + 1}:00: ${v}`}</title>
              <rect x={L + h * bw + 2} y={H - B - bh} width={bw - 4} height={bh} rx={2} fill="var(--accent)" />
              {h % 3 === 0 && <text x={L + h * bw + bw / 2} y={H - 5} textAnchor="middle">{h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

