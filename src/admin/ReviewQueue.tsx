import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../auth';
import { coverPath, loadMembers, loadTasks } from '../lib/data';
import { formatDateTime } from '../lib/dates';
import { formatDay } from '../lib/schedule';
import { errorText, must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Occurrence } from '../lib/types';
import { Avatar, ErrorBox, Loading, Photo } from '../components/ui';

export function ReviewQueue() {
  const { household } = useMe();
  const [filter, setFilter] = useState<'pending' | 'flagged'>('pending');
  const [error, setError] = useState<string | null>(null);
  const d = useAsync(async () => {
    const [occ, tasks, members] = await Promise.all([
      supabase.from('occurrences').select('*').eq('status', 'done').eq('review_status', filter)
        .order('done_at', { ascending: false }).limit(200).then((r) => must(r) as Occurrence[]),
      loadTasks(),
      loadMembers(),
    ]);
    return { occ, tasks: new Map(tasks.map((t) => [t.id, t])), members: new Map(members.map((m) => [m.id, m])) };
  }, [filter]);

  const approve = async (id: string) => {
    const { error: e } = await supabase.rpc('review_occurrence', { p_id: id, p_decision: 'approved', p_comment: null });
    if (e) setError(errorText(new Error(e.message))); else d.reload();
  };
  const approveAll = async () => {
    for (const o of d.data?.occ ?? []) await supabase.rpc('review_occurrence', { p_id: o.id, p_decision: 'approved', p_comment: null });
    d.reload();
  };

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Review</h1>
        {filter === 'pending' && (d.data?.occ.length ?? 0) > 1 && <button onClick={approveAll}>Approve all</button>}
      </div>
      <div className="tabs">
        <button className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>Waiting for review</button>
        <button className={filter === 'flagged' ? 'on' : ''} onClick={() => setFilter('flagged')}>Flagged</button>
      </div>
      <p className="muted">Open a completion to flag it, comment, send it back with updated requirements, or create a linked follow-up task.</p>
      <ErrorBox error={error ?? d.error} />
      {d.loading && !d.data ? <Loading /> : (
        <div className="list">
          {(d.data?.occ ?? []).length === 0 && <div className="empty">{filter === 'pending' ? 'Nothing waiting. All completions are reviewed.' : 'No flagged completions.'}</div>}
          {(d.data?.occ ?? []).map((o) => {
            const t = d.data!.tasks.get(o.task_id);
            return (
              <Link key={o.id} to={`/admin/occurrences/${o.id}`} className="item">
                <div className="thumb"><Photo path={t ? coverPath(t) : null} /></div>
                <div className="thumb">{o.proof_photo_path ? <Photo path={o.proof_photo_path} /> : <small>no photo</small>}</div>
                <div className="grow">
                  <div className="title">{t?.title ?? 'Archived task'}</div>
                  <small>Due {formatDay(o.due_date)} · done {o.done_at ? formatDateTime(o.done_at, household.timezone) : ''}{o.done_late ? ' · late' : ''}{o.attempt > 1 ? ` · attempt ${o.attempt}` : ''}</small>
                </div>
                <Avatar member={d.data!.members.get(o.worker_id)} />
                {filter === 'pending' && <button className="small" onClick={(e) => { e.preventDefault(); approve(o.id); }}>✓ Approve</button>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
