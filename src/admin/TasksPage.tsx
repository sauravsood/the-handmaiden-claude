import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../auth';
import { coverPath, loadLabels, loadMembers, loadOccurrences, loadTasks, restoreTask } from '../lib/data';
import { addDays, todayIn } from '../lib/dates';
import { describeSchedule, dueDatesBetween, formatDay } from '../lib/schedule';
import { errorText, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Member, Occurrence, TaskFull } from '../lib/types';
import { Avatar, ErrorBox, Loading, Photo, PriorityPill, SLOT_ICON } from '../components/ui';

type Tab = 'all' | 'upcoming' | 'overdue' | 'archived';

export function TasksPage() {
  const { household } = useMe();
  const today = todayIn(household.timezone);
  const [tab, setTab] = useState<Tab>('all');
  const [worker, setWorker] = useState('');
  const [label, setLabel] = useState('');
  const [prio, setPrio] = useState('');
  const [q, setQ] = useState('');

  const base = useAsync(() => Promise.all([loadMembers(), loadLabels()]), []);
  const tasks = useAsync(() => loadTasks({ archived: tab === 'archived' }), [tab === 'archived']);
  const occ = useAsync(
    () => (tab === 'overdue' ? loadOccurrences({ to: addDays(today, -1), status: ['open'] })
      : tab === 'upcoming' ? loadOccurrences({ from: addDays(today, 1), status: ['open'] }) : Promise.resolve([] as Occurrence[])),
    [tab, today],
  );

  const members = base.data?.[0] ?? [];
  const labels = base.data?.[1] ?? [];
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data]);

  const matches = (t: TaskFull) =>
    (!worker || t.worker_id === worker) &&
    (!label || t.task_labels.some((l) => l.label_id === label)) &&
    (!prio || t.priority === Number(prio)) &&
    (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()));
  const shown = (tasks.data ?? []).filter(matches);

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Tasks</h1>
        <Link className="btn primary" to="/admin/tasks/new">＋ New task</Link>
      </div>
      <div className="tabs" role="tablist">
        {(['all', 'upcoming', 'overdue', 'archived'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ all: 'All tasks', upcoming: 'Upcoming', overdue: 'Overdue', archived: 'Archived' }[t]}
          </button>
        ))}
      </div>
      <div className="row">
        <input id="tf-q" style={{ maxWidth: 220 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="tf-worker" style={{ width: 'auto' }} value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">All workers</option>
          {members.filter((m) => m.role === 'worker').map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <select id="tf-label" style={{ width: 'auto' }} value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All labels</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select id="tf-prio" style={{ width: 'auto' }} value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">Any priority</option>
          {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
        </select>
      </div>
      <ErrorBox error={tasks.error ?? base.error ?? occ.error} />
      {tasks.loading && !tasks.data ? <Loading /> :
        tab === 'all' || tab === 'archived' ? (
          <TaskList tasks={shown} byId={byId} labels={labels} archived={tab === 'archived'} onChange={tasks.reload} />
        ) : tab === 'upcoming' ? (
          <Upcoming tasks={shown} occ={(occ.data ?? []).filter((o) => taskById.has(o.task_id) && matches(taskById.get(o.task_id)!))}
            byId={byId} taskById={taskById} today={today} />
        ) : (
          <Overdue occ={(occ.data ?? []).filter((o) => taskById.has(o.task_id) && matches(taskById.get(o.task_id)!))}
            byId={byId} taskById={taskById} onChange={occ.reload} />
        )}
    </div>
  );
}

function TaskRow({ t, worker, right, sub }: { t: TaskFull; worker?: Member; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Link to={`/admin/tasks/${t.id}`} className={`item prio-${t.priority}`}>
      <div className="thumb"><Photo path={coverPath(t)} /></div>
      <div className="grow">
        <div className="title">{t.title} {t.photo_required && <span title="Photo required">📷</span>}</div>
        <small>{sub ?? <>{SLOT_ICON[t.time_slot]} {describeSchedule(t)}</>}</small>
      </div>
      <PriorityPill p={t.priority} />
      {right}
      <Avatar member={worker} />
    </Link>
  );
}

function TaskList({ tasks, byId, labels, archived, onChange }: {
  tasks: TaskFull[]; byId: Map<string, Member>; labels: { id: string; name: string }[]; archived: boolean; onChange: () => void;
}) {
  if (!tasks.length) return <div className="list"><div className="empty">{archived ? 'No archived tasks.' : 'No tasks yet. Create the first one.'}</div></div>;
  const labelName = new Map(labels.map((l) => [l.id, l.name]));
  return (
    <div className="list">
      {tasks.map((t) => (
        <TaskRow key={t.id} t={t} worker={byId.get(t.worker_id)} right={
          <>
            {t.task_labels.map((l) => <span key={l.label_id} className="pill">{labelName.get(l.label_id)}</span>)}
            {archived && (
              <button className="small" onClick={async (e) => { e.preventDefault(); await restoreTask(t.id); onChange(); }}>Restore</button>
            )}
          </>
        } />
      ))}
    </div>
  );
}

function Upcoming({ tasks, occ, byId, taskById, today }: {
  tasks: TaskFull[]; occ: Occurrence[]; byId: Map<string, Member>; taskById: Map<string, TaskFull>; today: string;
}) {
  const from = addDays(today, 1);
  const to = addDays(today, 14);
  const days = new Map<string, TaskFull[]>();
  for (const t of tasks) for (const d of dueDatesBetween(t, from, to)) days.set(d, [...(days.get(d) ?? []), t]);
  for (const o of occ) if (o.due_date <= to) {
    const t = taskById.get(o.task_id)!;
    if (!days.get(o.due_date)?.includes(t)) days.set(o.due_date, [...(days.get(o.due_date) ?? []), t]);
  }
  const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!sorted.length) return <div className="list"><div className="empty">Nothing scheduled in the next two weeks.</div></div>;
  return (
    <div className="stack">
      {sorted.map(([d, ts]) => (
        <div key={d} className="stack" style={{ gap: 6 }}>
          <h3>{formatDay(d)}</h3>
          <div className="list">
            {ts.sort((a, b) => a.priority - b.priority).map((t) => <TaskRow key={t.id} t={t} worker={byId.get(t.worker_id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Overdue({ occ, byId, taskById, onChange }: {
  occ: Occurrence[]; byId: Map<string, Member>; taskById: Map<string, TaskFull>; onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!occ.length) return <div className="list"><div className="empty">Nothing overdue.</div></div>;
  const skip = async (id: string) => {
    const { error: e } = await supabase.rpc('skip_occurrence', { p_id: id, p_reason: 'Skipped from overdue list' });
    if (e) setError(errorText(new Error(e.message))); else onChange();
  };
  return (
    <div className="stack">
      <ErrorBox error={error} />
      <div className="list">
        {occ.sort((a, b) => a.due_date.localeCompare(b.due_date)).map((o) => {
          const t = taskById.get(o.task_id)!;
          return (
            <TaskRow key={o.id} t={t} worker={byId.get(o.worker_id)} sub={<>Due {formatDay(o.due_date)}{o.attempt > 1 ? ' · sent back for a redo' : ''}</>}
              right={<button className="small" onClick={(e) => { e.preventDefault(); skip(o.id); }}>Skip</button>} />
          );
        })}
      </div>
    </div>
  );
}
