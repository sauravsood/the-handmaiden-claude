import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMe } from '../auth';
import {
  createTasks, draftFromTask, emptyDraft, loadLabels, loadMembers, loadTask, updateTasks,
  type PhotoRef, type TaskDraft,
} from '../lib/data';
import { todayIn } from '../lib/dates';
import { must, supabase } from '../lib/supabase';
import type { Label, Member, Occurrence } from '../lib/types';
import { Avatar, ErrorBox, Loading, PhotoInput, PhotoRefImg, PRIORITY_LABEL, SLOT_ICON, SLOT_LABEL } from '../components/ui';
import { SchedulePicker } from './SchedulePicker';

const toRef = (f: File): PhotoRef => ({ file: f, preview: URL.createObjectURL(f) });

export function TaskEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fromOcc = params.get('from');
  const copyOf = params.get('copy');
  const { member, household } = useMe();
  const today = todayIn(household.timezone);
  const nav = useNavigate();

  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [workers, setWorkers] = useState<Member[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [siblings, setSiblings] = useState<{ id: string; worker_id: string }[]>([]);
  const [applyAll, setApplyAll] = useState(true);
  const [note, setNote] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ms, ls] = await Promise.all([loadMembers(), loadLabels()]);
        setWorkers(ms.filter((m) => m.role === 'worker' && m.active));
        setLabels(ls);
        if (id) {
          const t = await loadTask(id);
          setDraft(draftFromTask(t));
          if (t.copy_group_id) {
            const sib = must(await supabase.from('tasks').select('id, worker_id').eq('copy_group_id', t.copy_group_id)
              .is('archived_at', null).neq('id', id)) as { id: string; worker_id: string }[];
            setSiblings(sib);
          }
        } else if (fromOcc) {
          // A follow-up task linked to a completed occurrence.
          const o = must(await supabase.from('occurrences').select('*').eq('id', fromOcc).single()) as Occurrence;
          const t = await loadTask(o.task_id);
          const d = draftFromTask(t);
          setDraft({
            ...d, title: `Follow-up: ${t.title}`, linked_from_occurrence_id: o.id, priority: Math.min(d.priority, 2) as 1 | 2,
            schedule: { ...emptyDraft(today).schedule, schedule_kind: 'once', due_date: today }, workerIds: [o.worker_id],
          });
        } else if (copyOf) {
          const d = draftFromTask(await loadTask(copyOf));
          setDraft({ ...d, workerIds: [], linked_from_occurrence_id: null, link_reason: '' });
        } else {
          setDraft(emptyDraft(today));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id, fromOcc, copyOf, today]);

  if (!draft) return error ? <ErrorBox error={error} /> : <Loading />;
  const set = (p: Partial<TaskDraft>) => setDraft({ ...draft, ...p });
  const editing = Boolean(id);

  const addLabel = async () => {
    const name = newLabel.trim();
    if (!name) return;
    const l = must(await supabase.from('labels').insert({ household_id: household.id, name }).select('*').single()) as Label;
    setLabels([...labels, l].sort((a, b) => a.name.localeCompare(b.name)));
    set({ labelIds: [...draft.labelIds, l.id] });
    setNewLabel('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!draft.title.trim()) return setError('Give the task a short title for admins.');
    if (!editing && draft.workerIds.length === 0) return setError('Choose at least one worker.');
    if (!draft.cover) return setError('Add a cover photo. It is what the worker sees.');
    setBusy(true);
    try {
      if (editing) {
        const ids = applyAll ? [id!, ...siblings.map((s) => s.id)] : [id!];
        await updateTasks(household.id, ids, draft, note, ids.length === 1 ? draft.workerIds[0] : undefined);
        nav(`/admin/tasks/${id}`);
      } else {
        const ids = await createTasks(household.id, member, draft);
        if (draft.linked_from_occurrence_id) {
          const o = must(await supabase.from('occurrences').select('task_id').eq('id', draft.linked_from_occurrence_id).single()) as { task_id: string };
          await supabase.from('comments').insert({
            household_id: household.id, task_id: o.task_id, occurrence_id: draft.linked_from_occurrence_id,
            author_id: member.id, kind: 'followup', body: draft.link_reason || `Follow-up task created: ${draft.title}`,
          });
          nav(`/admin/occurrences/${draft.linked_from_occurrence_id}`);
        } else {
          nav(ids.length === 1 ? `/admin/tasks/${ids[0]}` : '/admin/tasks');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form className="stack lg" onSubmit={save} style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>{editing ? 'Edit task' : draft.linked_from_occurrence_id ? 'Linked follow-up task' : 'New task'}</h1>
        <Link to={editing ? `/admin/tasks/${id}` : '/admin/tasks'} className="btn">Cancel</Link>
      </div>

      {draft.linked_from_occurrence_id && (
        <div className="card stack">
          <div className="notice">This task is linked to an earlier completion, so its outcome counts toward that worker's record.</div>
          <label className="field"><span>Why is a follow-up needed?</span>
            <textarea id="te-reason" value={draft.link_reason} onChange={(e) => set({ link_reason: e.target.value })} placeholder="Pans were left greasy" />
          </label>
        </div>
      )}

      <section className="card stack">
        <h2>What</h2>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="stack" style={{ gap: 6 }}>
            <small>Cover photo (what the worker sees)</small>
            <PhotoInput onPick={([f]) => set({ cover: toRef(f) })}>
              <div className="photo-slot big" role="button" tabIndex={0}>
                {draft.cover ? <PhotoRefImg value={draft.cover} /> : '＋ Add photo'}
              </div>
            </PhotoInput>
          </div>
          <div className="stack grow">
            <label className="field"><span>Title</span>
              <input id="te-title" required value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Wash dishes" />
            </label>
            <label className="field"><span>Description (the worker can open it to show someone)</span>
              <textarea id="te-desc" value={draft.description} onChange={(e) => set({ description: e.target.value })}
                placeholder="Use the green scrubber for pans. Dry and put away." />
            </label>
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <small>More photos (up to 4)</small>
          <div className="photo-row">
            {draft.photos.map((p, i) => (
              <div key={i} className="photo-slot">
                <PhotoRefImg value={p} />
                <button type="button" className="x small" onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })} aria-label="Remove photo">✕</button>
              </div>
            ))}
            {draft.photos.length < 4 && (
              <PhotoInput multiple onPick={(fs) => set({ photos: [...draft.photos, ...fs.map(toRef)].slice(0, 4) })}>
                <div className="photo-slot" role="button" tabIndex={0}>＋</div>
              </PhotoInput>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <small>Picture steps (optional, reset each time the task repeats)</small>
          {draft.steps.map((s, i) => (
            <div key={i} className="row">
              <PhotoInput onPick={([f]) => set({ steps: draft.steps.map((x, j) => (j === i ? { ...x, photo: toRef(f) } : x)) })}>
                <div className="photo-slot" style={{ width: 64, height: 64 }} role="button" tabIndex={0}>
                  {s.photo ? <PhotoRefImg value={s.photo} /> : '📷'}
                </div>
              </PhotoInput>
              <input className="grow" style={{ width: 'auto' }} value={s.label} placeholder={`Step ${i + 1}`}
                onChange={(e) => set({ steps: draft.steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <button type="button" className="ghost" onClick={() => set({ steps: draft.steps.filter((_, j) => j !== i) })} aria-label="Remove step">✕</button>
            </div>
          ))}
          <div><button type="button" className="small" onClick={() => set({ steps: [...draft.steps, { label: '', photo: null }] })}>＋ Add step</button></div>
        </div>
        <label className="check">
          <input id="te-photo-req" type="checkbox" checked={draft.photo_required} onChange={(e) => set({ photo_required: e.target.checked })} />
          <span><strong>Photo required when done.</strong> The worker must take a picture before the task counts as done.</span>
        </label>
      </section>

      <section className="card stack">
        <h2>Who</h2>
        {editing ? (
          siblings.length > 0 && applyAll ? (
            <p className="muted">Each copy keeps its own worker. Untick "apply to all copies" below to reassign this one.</p>
          ) : (
            <select id="te-worker" value={draft.workerIds[0]} onChange={(e) => set({ workerIds: [e.target.value] })}>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}
            </select>
          )
        ) : workers.length === 0 ? (
          <div className="notice">No workers yet. <Link to="/admin/people">Add a worker</Link> first.</div>
        ) : (
          <>
            <div className="chips">
              {workers.map((w) => {
                const on = draft.workerIds.includes(w.id);
                return (
                  <button key={w.id} type="button" className={`chip row${on ? ' on' : ''}`} style={{ gap: 6 }}
                    onClick={() => set({ workerIds: on ? draft.workerIds.filter((x) => x !== w.id) : [...draft.workerIds, w.id] })}>
                    <Avatar member={w} size={22} /> {w.display_name}
                  </button>
                );
              })}
            </div>
            {draft.workerIds.length > 1 && (
              <small>Each worker gets their own copy of this task, tracked separately.</small>
            )}
          </>
        )}
      </section>

      <section className="card stack">
        <h2>When</h2>
        <SchedulePicker value={draft.schedule} onChange={(schedule) => set({ schedule })} today={today} />
        <div className="grid2">
          <label className="field"><span>Time of day</span>
            <select id="te-slot" value={draft.time_slot} onChange={(e) => set({ time_slot: e.target.value as TaskDraft['time_slot'] })}>
              {(['anytime', 'morning', 'afternoon', 'evening'] as const).map((s) => (
                <option key={s} value={s}>{SLOT_ICON[s]} {SLOT_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="field"><span>Exact time (optional)</span>
            <input id="te-time" type="time" value={draft.exact_time} onChange={(e) => set({ exact_time: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2>Organise</h2>
        <label className="field"><span>Priority</span>
          <select id="te-prio" value={draft.priority} onChange={(e) => set({ priority: Number(e.target.value) as TaskDraft['priority'] })}>
            {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <small>Labels</small>
          <div className="chips">
            {labels.map((l) => {
              const on = draft.labelIds.includes(l.id);
              return (
                <button key={l.id} type="button" className={`chip${on ? ' on' : ''}`}
                  onClick={() => set({ labelIds: on ? draft.labelIds.filter((x) => x !== l.id) : [...draft.labelIds, l.id] })}>{l.name}</button>
              );
            })}
          </div>
          <div className="row">
            <input id="te-newlabel" style={{ width: 200 }} placeholder="New label, e.g. Kitchen" value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }} />
            <button type="button" className="small" onClick={addLabel}>Add</button>
          </div>
        </div>
      </section>

      {editing && (
        <section className="card stack">
          <h2>Save changes</h2>
          <label className="field"><span>What changed? (kept in the task's history)</span>
            <input id="te-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Added: scrub the pans too" />
          </label>
          {siblings.length > 0 && (
            <label className="check">
              <input id="te-applyall" type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              Apply to all {siblings.length + 1} copies of this task
            </label>
          )}
        </section>
      )}

      <ErrorBox error={error} />
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : draft.workerIds.length > 1 ? `Create ${draft.workerIds.length} tasks` : 'Create task'}</button>
      </div>
    </form>
  );
}
