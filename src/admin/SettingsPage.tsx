import { useState } from 'react';
import { useAuth, useMe } from '../auth';
import { loadLabels, loadMembers } from '../lib/data';
import { formatDateTime } from '../lib/dates';
import { must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Activity } from '../lib/types';
import { ErrorBox, Loading } from '../components/ui';

const ACTION: Record<string, string> = {
  task_created: 'created a task', task_edited: 'edited a task', task_archived: 'archived a task',
  occurrence_done: 'completed a task', occurrence_undone: 'undid a completion', occurrence_skipped: 'skipped a task',
  occurrence_approved: 'approved a completion', occurrence_flagged: 'flagged a completion',
  occurrence_reopened: 'sent a task back', worker_added: 'added a worker',
};

export function SettingsPage() {
  const { household } = useMe();
  const { reload, signOut, member } = useAuth();
  const [name, setName] = useState(household.name);
  const [tz, setTz] = useState(household.timezone);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = useAsync(async () => {
    const [labels, members, activity, titles] = await Promise.all([
      loadLabels(), loadMembers(),
      supabase.from('activity').select('*').order('at', { ascending: false }).limit(100).then((r) => must(r) as Activity[]),
      supabase.from('tasks').select('id, title').then((r) => must(r) as { id: string; title: string }[]),
    ]);
    return { labels, members: new Map(members.map((m) => [m.id, m.display_name])), activity, titles: new Map(titles.map((t) => [t.id, t.title])) };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error: err } = await supabase.from('households').update({ name: name.trim(), timezone: tz.trim() }).eq('id', household.id);
    if (err) setError(err.message); else { setSaved(true); reload(); }
  };

  return (
    <div className="stack lg" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Settings</h1>
        <div className="row"><span className="muted">{member?.display_name}</span><button onClick={signOut}>Sign out</button></div>
      </div>
      <form className="card stack" onSubmit={save}>
        <h2>Household</h2>
        <label className="field"><span>Name</span><input id="st-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
        <label className="field"><span>Time zone (decides when each day starts)</span><input id="st-tz" value={tz} onChange={(e) => { setTz(e.target.value); setSaved(false); }} /></label>
        <ErrorBox error={error} />
        <div className="row"><button className="primary">Save</button>{saved && <span className="muted">Saved</span>}</div>
      </form>

      {d.loading && !d.data ? <Loading /> : d.data && (
        <>
          <section className="card stack">
            <h2>Labels</h2>
            <div className="chips">
              {d.data.labels.length === 0 && <span className="muted">Labels are added from the task form.</span>}
              {d.data.labels.map((l) => (
                <span key={l.id} className="chip row" style={{ gap: 6 }}>
                  {l.name}
                  <button className="ghost small" aria-label={`Delete ${l.name}`} onClick={async () => { await supabase.from('labels').delete().eq('id', l.id); d.reload(); }}>✕</button>
                </span>
              ))}
            </div>
          </section>
          <section className="stack">
            <h2>Activity</h2>
            <div className="list">
              {d.data.activity.length === 0 && <div className="empty">No activity yet.</div>}
              {d.data.activity.map((a) => (
                <div key={a.id} className="item">
                  <div className="grow">
                    <strong>{d.data!.members.get(a.actor_id ?? '') ?? 'System'}</strong> {ACTION[a.action] ?? a.action}
                    {a.task_id && <> · {d.data!.titles.get(a.task_id)}</>}
                    {typeof a.details.comment === 'string' && a.details.comment && <small> · "{a.details.comment}"</small>}
                  </div>
                  <small>{formatDateTime(a.at, household.timezone)}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
