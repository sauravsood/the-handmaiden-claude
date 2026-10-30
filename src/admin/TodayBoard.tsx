import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../auth';
import { coverPath, loadMembers, loadOccurrences, loadTasks } from '../lib/data';
import { formatTime, todayIn } from '../lib/dates';
import { formatDay } from '../lib/schedule';
import { must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Leave, Occurrence } from '../lib/types';
import { Avatar, ErrorBox, Loading, Photo, PriorityPill, SLOT_ICON, StatusPill } from '../components/ui';

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };

export function TodayBoard() {
  const { household } = useMe();
  const today = todayIn(household.timezone);
  const d = useAsync(async () => {
    const [members, tasks, open, todays, leave] = await Promise.all([
      loadMembers(),
      loadTasks(),
      loadOccurrences({ to: today, status: ['open'] }),
      loadOccurrences({ from: today, to: today }),
      supabase.from('leave').select('*').lte('from_date', today).gte('to_date', today).then((r) => must(r) as Leave[]),
    ]);
    const occ = new Map<string, Occurrence>();
    for (const o of [...open, ...todays]) occ.set(o.id, o);
    return { members, tasks: new Map(tasks.map((t) => [t.id, t])), occ: [...occ.values()], leave };
  }, [today]);

  useEffect(() => {
    const ch = supabase.channel('today-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => d.reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [d.reload]);

  const workers = useMemo(() => (d.data?.members ?? []).filter((m) => m.role === 'worker' && m.active), [d.data]);
  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { tasks, occ, leave } = d.data;

  const total = occ.filter((o) => o.due_date === today && o.status !== 'skipped').length;
  const done = occ.filter((o) => o.due_date === today && o.status === 'done').length;
  const overdue = occ.filter((o) => o.status === 'open' && o.due_date < today).length;

  return (
    <div className="stack lg">
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <small>{formatDay(today)} · {done} of {total} done{overdue ? ` · ${overdue} overdue` : ''}</small>
        </div>
        <Link className="btn primary" to="/admin/tasks/new">＋ New task</Link>
      </div>
      {workers.length === 0 ? (
        <div className="card stack">
          <h2>Welcome</h2>
          <p>Start by adding the people who do the work, then create their tasks.</p>
          <div className="row"><Link className="btn primary" to="/admin/people">Add a worker</Link></div>
        </div>
      ) : (
        <div className="board">
          {workers.map((w) => {
            const mine = occ.filter((o) => o.worker_id === w.id).sort((a, b) => {
              const ta = tasks.get(a.task_id), tb = tasks.get(b.task_id);
              const rank = (o: Occurrence) => (o.status === 'open' ? (o.due_date < today ? 0 : 1) : 2);
              return rank(a) - rank(b) || (ta?.priority ?? 4) - (tb?.priority ?? 4)
                || SLOT_ORDER[ta?.time_slot ?? 'anytime'] - SLOT_ORDER[tb?.time_slot ?? 'anytime'];
            });
            const away = leave.find((l) => l.worker_id === w.id);
            const left = mine.filter((o) => o.status === 'open').length;
            return (
              <section key={w.id} className="board-col">
                <header>
                  <Avatar member={w} />
                  <Link to={`/admin/people/${w.id}`}><strong>{w.display_name}</strong></Link>
                  <span className="muted">{left ? `${left} left` : 'all done'}</span>
                  {away && <span className="pill warn">On leave until {formatDay(away.to_date)}</span>}
                </header>
                <div className="list">
                  {mine.length === 0 && <div className="empty">Nothing today.</div>}
                  {mine.map((o) => {
                    const t = tasks.get(o.task_id);
                    return (
                      <Link key={o.id} to={`/admin/occurrences/${o.id}`} className={`item prio-${t?.priority ?? 4}`}>
                        <div className="thumb"><Photo path={o.proof_photo_path ?? (t ? coverPath(t) : null)} /></div>
                        <div className="grow">
                          <div className="title">{t?.title ?? 'Archived task'}</div>
                          <small>
                            {SLOT_ICON[t?.time_slot ?? 'anytime']}{' '}
                            {o.done_at ? `done ${formatTime(o.done_at, household.timezone)}` : o.due_date < today ? `due ${formatDay(o.due_date)}` : ''}
                            {o.attempt > 1 && o.status === 'open' ? ' · redo' : ''}
                          </small>
                        </div>
                        <PriorityPill p={t?.priority ?? 4} />
                        <StatusPill o={o} today={today} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
