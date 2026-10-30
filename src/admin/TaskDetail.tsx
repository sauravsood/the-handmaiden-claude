import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMe } from '../auth';
import { archiveTask, coverPath, loadLabels, loadMembers, loadOccurrences, loadTask } from '../lib/data';
import { formatDateTime, todayIn } from '../lib/dates';
import { describeSchedule, formatDay } from '../lib/schedule';
import { must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Comment, Task, TaskRevision } from '../lib/types';
import { Avatar, ErrorBox, Loading, Photo, PRIORITY_LABEL, SLOT_ICON, SLOT_LABEL, StatusPill } from '../components/ui';
import { CommentList } from './CommentList';

export function TaskDetail() {
  const { id } = useParams();
  const { household } = useMe();
  const today = todayIn(household.timezone);
  const nav = useNavigate();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const d = useAsync(async () => {
    const [task, members, labels, occ, comments, revisions] = await Promise.all([
      loadTask(id!),
      loadMembers(),
      loadLabels(),
      loadOccurrences({ taskId: id }),
      supabase.from('comments').select('*').eq('task_id', id!).order('created_at').then((r) => must(r) as Comment[]),
      supabase.from('task_revisions').select('*').eq('task_id', id!).order('version', { ascending: false }).then((r) => must(r) as TaskRevision[]),
    ]);
    const sib = task.copy_group_id
      ? (must(await supabase.from('tasks').select('id, worker_id').eq('copy_group_id', task.copy_group_id).neq('id', task.id)) as Pick<Task, 'id' | 'worker_id'>[])
      : [];
    const occIds = occ.map((o) => o.id);
    const linked = occIds.length
      ? (must(await supabase.from('tasks').select('id, title, worker_id, linked_from_occurrence_id, link_reason').in('linked_from_occurrence_id', occIds)) as Task[])
      : [];
    return { task, members, labels, occ, comments, revisions, sib, linked };
  }, [id]);

  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { task: t, members, labels, occ, comments, revisions, sib, linked } = d.data;
  const byId = new Map(members.map((m) => [m.id, m]));
  const labelName = new Map(labels.map((l) => [l.id, l.name]));
  const done = occ.filter((o) => o.status === 'done').length;
  const due = occ.filter((o) => o.status !== 'skipped' && (o.status !== 'open' || o.due_date < today)).length;

  return (
    <div className="stack lg">
      <div className="page-head">
        <div className="row">
          <Link to="/admin/tasks" className="btn ghost">←</Link>
          <h1>{t.title}</h1>
          {t.archived_at && <span className="pill">Archived</span>}
        </div>
        <div className="row">
          <Link className="btn" to={`/admin/tasks/new?copy=${t.id}`}>Duplicate</Link>
          {!t.archived_at && <Link className="btn primary" to={`/admin/tasks/${t.id}/edit`}>Edit</Link>}
          {!t.archived_at && (confirmArchive
            ? <button className="danger" onClick={async () => { await archiveTask(t.id); nav('/admin/tasks'); }}>Confirm archive</button>
            : <button onClick={() => setConfirmArchive(true)}>Archive</button>)}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div className="thumb" style={{ width: 200, height: 200, fontSize: 64 }}><Photo path={coverPath(t)} /></div>
        <div className="stack grow" style={{ minWidth: 240 }}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{t.description || <span className="muted">No description.</span>}</p>
          <div className="row">
            <Avatar member={byId.get(t.worker_id)} /> <strong>{byId.get(t.worker_id)?.display_name}</strong>
            {sib.length > 0 && <span className="muted">· also copied to {sib.map((s) => byId.get(s.worker_id)?.display_name).join(', ')}</span>}
          </div>
          <div className="row">
            <span className="pill accent">{describeSchedule(t)}</span>
            <span className="pill">{SLOT_ICON[t.time_slot]} {SLOT_LABEL[t.time_slot]}{t.exact_time ? ` ${t.exact_time.slice(0, 5)}` : ''}</span>
            <span className="pill">{PRIORITY_LABEL[t.priority]}</span>
            {t.photo_required && <span className="pill warn">📷 Photo required</span>}
            {t.task_labels.map((l) => <span key={l.label_id} className="pill">{labelName.get(l.label_id)}</span>)}
            <span className="pill">v{t.version}</span>
          </div>
          {due > 0 && <small>{done} of {due} due times completed</small>}
          {t.linked_from_occurrence_id && (
            <div className="notice">Follow-up to an <Link to={`/admin/occurrences/${t.linked_from_occurrence_id}`}>earlier completion</Link>{t.link_reason ? `: ${t.link_reason}` : ''}</div>
          )}
        </div>
      </div>

      {(t.task_media.filter((m) => m.kind === 'photo').length > 0 || t.task_steps.length > 0) && (
        <section className="stack">
          <h2>Photos and steps</h2>
          <div className="gallery">
            {t.task_media.filter((m) => m.kind === 'photo').map((m) => <figure key={m.id}><Photo path={m.storage_path} /></figure>)}
            {t.task_steps.map((s, i) => <figure key={s.id}><Photo path={s.photo_path} fallback="🔹" /><figcaption>{i + 1}. {s.label}</figcaption></figure>)}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>History</h2>
        {occ.length === 0 ? <div className="list"><div className="empty">Not due yet.</div></div> : (
          <div className="list">
            {occ.slice(0, 30).map((o) => (
              <Link key={o.id} className="item" to={`/admin/occurrences/${o.id}`}>
                <div className="grow">
                  <div className="title">{formatDay(o.due_date)}</div>
                  <small>
                    {o.done_at ? `Done ${formatDateTime(o.done_at, household.timezone)}` : o.skip_reason ?? ''}
                    {o.attempt > 1 ? ` · attempt ${o.attempt}` : ''}
                  </small>
                </div>
                {o.proof_photo_path && <div className="thumb" style={{ width: 40, height: 40 }}><Photo path={o.proof_photo_path} /></div>}
                <StatusPill o={o} today={today} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {linked.length > 0 && (
        <section className="stack">
          <h2>Follow-up tasks</h2>
          <div className="list">
            {linked.map((l) => (
              <Link key={l.id} className="item" to={`/admin/tasks/${l.id}`}>
                <div className="grow"><div className="title">{l.title}</div><small>{l.link_reason}</small></div>
                <Avatar member={byId.get(l.worker_id)} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Comments</h2>
        <CommentList comments={comments} members={byId} taskId={t.id} onAdded={d.reload} />
      </section>

      <section className="stack">
        <h2>Earlier versions</h2>
        {revisions.length === 0 ? <p className="muted">This task has not been edited.</p> : (
          <div className="list">
            {revisions.map((r) => (
              <details key={r.id} className="item" style={{ display: 'block' }}>
                <summary>
                  <strong>Version {r.version}</strong> <span className="muted">· replaced {formatDateTime(r.changed_at, household.timezone)} by {byId.get(r.changed_by ?? '')?.display_name ?? 'someone'}{r.note ? ` · "${r.note}"` : ''}</span>
                </summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  <div><strong>{r.snapshot.title}</strong></div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{r.snapshot.description || <span className="muted">No description.</span>}</p>
                  <small>{describeSchedule(r.snapshot)} · {byId.get(r.snapshot.worker_id)?.display_name} · {r.snapshot.photo_required ? 'photo required' : 'no photo required'}</small>
                  <div className="photo-row">
                    {r.snapshot.media.map((m) => <div key={m.id} className="photo-slot"><Photo path={m.storage_path} /></div>)}
                  </div>
                  {r.snapshot.steps.length > 0 && <small>Steps: {r.snapshot.steps.map((s) => s.label).join(' → ')}</small>}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
