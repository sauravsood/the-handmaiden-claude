import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '../auth';
import { coverPath, loadMembers, loadTask } from '../lib/data';
import { formatDateTime, todayIn } from '../lib/dates';
import { formatDay } from '../lib/schedule';
import { errorText, must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Comment, Occurrence, OccurrenceAttempt, Task } from '../lib/types';
import { Avatar, ErrorBox, Loading, Modal, Photo, StatusPill } from '../components/ui';
import { CommentList } from './CommentList';

type Action = 'approve' | 'flag' | 'reopen' | 'skip' | null;

export function OccurrenceDetail() {
  const { id } = useParams();
  const { household } = useMe();
  const today = todayIn(household.timezone);
  const [action, setAction] = useState<Action>(null);

  const d = useAsync(async () => {
    const o = must(await supabase.from('occurrences').select('*').eq('id', id!).single()) as Occurrence;
    const [task, members, attempts, comments, followups] = await Promise.all([
      loadTask(o.task_id),
      loadMembers(),
      supabase.from('occurrence_attempts').select('*').eq('occurrence_id', o.id).order('attempt').then((r) => must(r) as OccurrenceAttempt[]),
      supabase.from('comments').select('*').eq('occurrence_id', o.id).order('created_at').then((r) => must(r) as Comment[]),
      supabase.from('tasks').select('id, title, worker_id, link_reason, archived_at').eq('linked_from_occurrence_id', o.id).then((r) => must(r) as Task[]),
    ]);
    return { o, task, members, attempts, comments, followups };
  }, [id]);

  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { o, task: t, members, attempts, comments, followups } = d.data;
  const byId = new Map(members.map((m) => [m.id, m]));
  const worker = byId.get(o.worker_id);

  return (
    <div className="stack lg" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div className="row">
          <Link to={`/admin/tasks/${t.id}`} className="btn ghost">←</Link>
          <div>
            <h1>{t.title}</h1>
            <small>Due {formatDay(o.due_date)} · {worker?.display_name}{o.attempt > 1 ? ` · attempt ${o.attempt}` : ''}</small>
          </div>
          <StatusPill o={o} today={today} />
        </div>
      </div>

      <div className="card stack">
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <small>Task</small>
            <div className="thumb" style={{ width: 160, height: 160, fontSize: 48 }}><Photo path={coverPath(t)} /></div>
          </div>
          {o.status === 'done' && (
            <div className="stack" style={{ gap: 4 }}>
              <small>Proof</small>
              <div className="thumb" style={{ width: 160, height: 160, fontSize: 32 }}>
                {o.proof_photo_path ? <Photo path={o.proof_photo_path} /> : <span className="muted" style={{ fontSize: 13 }}>No photo</span>}
              </div>
            </div>
          )}
          <div className="stack grow" style={{ minWidth: 220 }}>
            <div className="row"><Avatar member={worker} /> <strong>{worker?.display_name}</strong></div>
            {o.done_at && <p>Done {formatDateTime(o.done_at, household.timezone)}{o.done_late ? ' (late)' : ''}</p>}
            {o.status === 'skipped' && <p>Skipped{o.skip_reason ? `: ${o.skip_reason}` : ''}</p>}
            {t.task_steps.length > 0 && o.status === 'done' && (
              <small>Steps ticked: {o.steps_done.length} of {t.task_steps.length}</small>
            )}
            {o.task_version && o.task_version !== t.version && (
              <small>Completed against version {o.task_version}; the task is now version {t.version}.</small>
            )}
            {o.reviewed_at && <small>Reviewed by {byId.get(o.reviewed_by ?? '')?.display_name} {formatDateTime(o.reviewed_at, household.timezone)}</small>}
          </div>
        </div>
        <div className="row">
          {o.status === 'done' && o.review_status !== 'approved' && <button className="primary" onClick={() => setAction('approve')}>✓ Approve</button>}
          {o.status === 'done' && o.review_status !== 'flagged' && <button className="danger" onClick={() => setAction('flag')}>⚑ Flag as unsatisfactory</button>}
          {o.status === 'done' && <button onClick={() => setAction('reopen')}>↺ Reopen and send back</button>}
          {o.status === 'done' && <Link className="btn" to={`/admin/tasks/new?from=${o.id}`}>＋ Create linked task</Link>}
          {(o.status === 'open' || o.status === 'missed') && <button onClick={() => setAction('skip')}>Skip</button>}
          <Link className="btn ghost" to={`/admin/tasks/${t.id}/edit`}>Edit requirements</Link>
        </div>
      </div>

      {(attempts.length > 0 || followups.length > 0) && (
        <section className="stack">
          <h2>Track record</h2>
          <div className="list">
            {attempts.map((a) => (
              <div key={a.id} className="item">
                <div className="thumb" style={{ width: 48, height: 48 }}>{a.proof_photo_path ? <Photo path={a.proof_photo_path} /> : '—'}</div>
                <div className="grow">
                  <div className="title">Attempt {a.attempt}</div>
                  <small>{a.done_at ? `Done ${formatDateTime(a.done_at, household.timezone)}` : ''} · against version {a.task_version ?? '?'} · sent back {formatDateTime(a.closed_at, household.timezone)}</small>
                </div>
                <span className={`pill ${a.review_status === 'flagged' ? 'bad' : 'good'}`}>{a.review_status === 'flagged' ? 'Flagged' : a.review_status}</span>
              </div>
            ))}
            {followups.map((f) => (
              <Link key={f.id} to={`/admin/tasks/${f.id}`} className="item">
                <div className="grow"><div className="title">Follow-up: {f.title}</div><small>{f.link_reason}</small></div>
                <Avatar member={byId.get(f.worker_id)} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Comments</h2>
        <p className="muted" style={{ fontSize: 13 }}>The worker sees these comments on the task.</p>
        <CommentList comments={comments} members={byId} taskId={t.id} occurrenceId={o.id} onAdded={d.reload} />
      </section>

      {action && <ActionDialog action={action} o={o} t={t} onClose={() => setAction(null)} onDone={() => { setAction(null); d.reload(); }} />}
    </div>
  );
}

function ActionDialog({ action, o, t, onClose, onDone }: {
  action: Exclude<Action, null>; o: Occurrence; t: Task; onClose: () => void; onDone: () => void;
}) {
  const [comment, setComment] = useState('');
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titles = { approve: 'Approve completion', flag: 'Flag as unsatisfactory', reopen: 'Reopen and send back', skip: 'Skip this time' };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve' || action === 'flag') {
        if (action === 'flag' && !comment.trim()) throw new Error('Say what was wrong, so it is on record.');
        const { error: e } = await supabase.rpc('review_occurrence', {
          p_id: o.id, p_decision: action === 'approve' ? 'approved' : 'flagged', p_comment: comment.trim() || null,
        });
        if (e) throw new Error(e.message);
      } else if (action === 'reopen') {
        if (title.trim() !== t.title || desc.trim() !== t.description) {
          // Updated requirements: the old version stays in the task's history.
          must(await supabase.from('tasks').update({
            title: title.trim(), description: desc.trim(), edited_at: new Date().toISOString(),
            edit_note: `Updated when sending back: ${comment.trim() || 'requirements changed'}`,
          }).eq('id', t.id));
        }
        const { error: e } = await supabase.rpc('reopen_occurrence', { p_id: o.id, p_comment: comment.trim() || null });
        if (e) throw new Error(e.message);
      } else {
        const { error: e } = await supabase.rpc('skip_occurrence', { p_id: o.id, p_reason: comment.trim() || null });
        if (e) throw new Error(e.message);
      }
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={titles[action]} onClose={onClose}>
      {action === 'reopen' && (
        <>
          <p className="muted">The task goes back on the worker's list today. This completion is kept in the track record.</p>
          <label className="field"><span>Title</span><input id="ro-title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>Description (change it to update the requirements; the original is kept)</span>
            <textarea id="ro-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
        </>
      )}
      <label className="field"><span>{action === 'flag' ? 'What was wrong?' : action === 'skip' ? 'Reason (optional)' : 'Comment (optional)'}</span>
        <textarea id="ro-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <ErrorBox error={error} />
      <div className="row">
        <button className={action === 'flag' ? 'danger' : 'primary'} disabled={busy} onClick={run}>{titles[action]}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
