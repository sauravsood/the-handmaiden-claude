import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, useMe } from '../auth';
import { coverPath } from '../lib/data';
import { completeOccurrence } from '../lib/offline';
import { errorText, supabase } from '../lib/supabase';
import type { Occurrence, TaskFull } from '../lib/types';
import { Avatar, Photo, SLOT_ICON } from '../components/ui';
import { useWorkerData } from './useWorkerData';
import { WorkerTask } from './WorkerTask';

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };

export function WorkerHome() {
  const { id } = useParams();
  const nav = useNavigate();
  const { member, household } = useMe();
  const data = useWorkerData();
  const { occ, tasks, today } = data;
  const [toast, setToast] = useState<{ id: string; queued: boolean } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const todo = occ.filter((o) => o.status === 'open').sort((a, b) => {
    const ta = tasks.get(a.task_id), tb = tasks.get(b.task_id);
    return Number(b.due_date < today) - Number(a.due_date < today)
      || (ta?.priority ?? 4) - (tb?.priority ?? 4)
      || SLOT_ORDER[ta?.time_slot ?? 'anytime'] - SLOT_ORDER[tb?.time_slot ?? 'anytime']
      || (ta?.exact_time ?? '').localeCompare(tb?.exact_time ?? '');
  });
  const done = occ.filter((o) => o.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));

  /** Completes a task. Tasks that need a photo open their page instead. */
  const finish = async (o: Occurrence, photo: Blob | null = null, steps: string[] = []) => {
    const t = tasks.get(o.task_id);
    if (t?.photo_required && !photo) { nav(`/w/task/${o.id}?camera=1`); return; }
    setError(null);
    data.markLocal(o.id, { status: 'done', done_at: new Date().toISOString() });
    setCelebrate(true);
    window.setTimeout(() => setCelebrate(false), 900);
    try {
      const res = await completeOccurrence({ occurrenceId: o.id, householdId: household.id, photo, steps });
      if (res === 'queued') data.setQueued((q) => new Set(q).add(o.id));
      setToast({ id: o.id, queued: res === 'queued' });
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 5000);
    } catch (e) {
      data.markLocal(o.id, { status: 'open', done_at: null });
      setError(errorText(e));
    }
    if (id) nav('/w');
  };

  const undo = async () => {
    if (!toast) return;
    const occId = toast.id;
    setToast(null);
    if (toast.queued) return; // still on the phone; nothing reached the server
    const { error: e } = await supabase.rpc('undo_completion', { p_id: occId });
    if (e) setError(errorText(new Error(e.message)));
    data.reload();
  };

  if (id) {
    const o = occ.find((x) => x.id === id);
    if (!data.loaded) return <div className="worker" />;
    if (!o || !tasks.get(o.task_id)) { nav('/w', { replace: true }); return null; }
    return (
      <WorkerTask
        o={o} t={tasks.get(o.task_id)!} today={today} queued={data.queued.has(o.id)}
        comments={data.comments.filter((c) => c.occurrence_id === o.id)}
        onDone={(photo, steps) => finish(o, photo, steps)} onBack={() => nav('/w')}
      />
    );
  }

  return (
    <div className="worker">
      <header className="w-top">
        <Avatar member={member} />
        <ProfileMenu />
        <div className="count" aria-label={`${todo.length} tasks left`}>
          {todo.length === 0 && data.loaded ? '🎉' : <>{todo.length} <span aria-hidden="true">🧹</span></>}
        </div>
      </header>
      {data.offline && <div className="w-note" role="status"><span style={{ fontSize: 28 }}>📵</span><span>No internet. Ticks are saved and sent later.</span></div>}
      {error && <div className="error" role="alert">{error}</div>}

      {todo.length > 0 && (
        <div className="w-grid">
          {todo.map((o) => <Tile key={o.id} o={o} t={tasks.get(o.task_id)} today={today} onOpen={() => nav(`/w/task/${o.id}`)} onTick={() => finish(o)} />)}
        </div>
      )}
      {data.loaded && todo.length === 0 && (
        <div className="center-page" style={{ minHeight: 200 }}><span style={{ fontSize: 120 }} aria-label="All done">✅</span></div>
      )}

      {done.length > 0 && (
        <>
          <div className="w-section" aria-label="Done"><span>✅</span></div>
          <div className="w-grid">
            {done.map((o) => <Tile key={o.id} o={o} t={tasks.get(o.task_id)} today={today} queued={data.queued.has(o.id)} onOpen={() => nav(`/w/task/${o.id}`)} />)}
          </div>
        </>
      )}

      {celebrate && <div className="celebrate" aria-hidden="true"><span>✅</span></div>}
      {toast && (
        <div className="w-toast" role="status">
          <span>{toast.queued ? '📵 ✅' : '✅'}</span>
          <button onClick={undo} aria-label="Undo">↩</button>
        </div>
      )}
    </div>
  );
}

function Tile({ o, t, today, queued, onOpen, onTick }: {
  o: Occurrence; t: TaskFull | undefined; today: string; queued?: boolean; onOpen: () => void; onTick?: () => void;
}) {
  if (!t) return null;
  const isDone = o.status === 'done';
  const cls = ['w-tile', isDone ? 'done' : '', !isDone && o.due_date < today ? 'overdue' : '', !isDone && t.priority === 1 ? 'p1' : ''].join(' ');
  return (
    <div className={cls}>
      <button className="pic" onClick={onOpen} aria-label={t.title} style={{ border: 0, padding: 0, borderRadius: 0 }}>
        <Photo path={coverPath(t)} alt={t.title} />
      </button>
      <div className="badges">
        <span>
          {SLOT_ICON[t.time_slot] && <span className="badge">{SLOT_ICON[t.time_slot]}</span>}
          {o.attempt > 1 && !isDone && <span className="badge" aria-label="Do again">↺</span>}
        </span>
        <span>
          {t.priority === 1 && !isDone && <span className="badge" aria-label="Urgent">⭐</span>}
          {t.photo_required && !isDone && <span className="badge" aria-label="Needs photo">📷</span>}
          {queued && <span className="badge" aria-label="Waiting for internet">📵</span>}
        </span>
      </div>
      {onTick ? (
        <button className="tick" onClick={onTick} aria-label={`Done: ${t.title}`}>{t.photo_required ? '📷' : '✓'}</button>
      ) : (
        <span className="tick" style={{ textAlign: 'center' }} aria-label="Done">✓</span>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { member } = useMe();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="row">
      <strong style={{ fontSize: 20 }}>{member.display_name}</strong>
      <button className="ghost" aria-label="Menu" onClick={() => setOpen(!open)}>⋯</button>
      {open && <button className="small" onClick={signOut}>Sign out</button>}
    </div>
  );
}
