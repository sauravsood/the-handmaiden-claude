import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../auth';
import { coverPath, loadMembers, loadTasks } from '../lib/data';
import { taskIcon } from '../lib/taskIcon';
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
        <div className="review-list">
          {(d.data?.occ ?? []).length === 0 && <div className="list"><div className="empty">{filter === 'pending' ? 'Nothing waiting. All completions are reviewed.' : 'No flagged completions.'}</div></div>}
          {(d.data?.occ ?? []).map((o) => {
            const t = d.data!.tasks.get(o.task_id);
            const who = d.data!.members.get(o.worker_id);
            const href = `/admin/occurrences/${o.id}`;
            return (
              <article key={o.id} className="review-card">
                <Link to={href} className="rc-head">
                  <div className="thumb"><Photo path={t ? coverPath(t) : null} fallback={t ? taskIcon(t) : undefined} /></div>
                  <div className="grow">
                    <div className="rc-title">{t?.title ?? 'Archived task'}</div>
                    <div className="rc-who">
                      <Avatar member={who} size={22} />
                      <span>{who?.display_name ?? 'Someone'} · done {o.done_at ? formatDateTime(o.done_at, household.timezone) : ''}</span>
                    </div>
                  </div>
                  <span className="rc-chev" aria-hidden="true">›</span>
                </Link>
                <div className="rc-tags">
                  <span className="pill">📅 Due {formatDay(o.due_date)}</span>
                  {o.done_late && <span className="pill warn">Late</span>}
                  {o.attempt > 1 && <span className="pill accent">Attempt {o.attempt}</span>}
                  {filter === 'flagged' && <span className="pill bad">⚑ Flagged</span>}
                  {!o.proof_photo_path && !t?.photo_required && <span className="pill">No photo</span>}
                </div>
                {o.proof_photo_path ? (
                  <Link to={href} className="rc-proof" aria-label="Proof photo">
                    <Photo path={o.proof_photo_path} fallback="📷" />
                    <span className="rc-proof-label">📷 Proof photo</span>
                  </Link>
                ) : t?.photo_required && (
                  <div className="rc-nophoto"><span aria-hidden="true">📷</span>Photo was required but none was taken</div>
                )}
                <div className="rc-actions">
                  <Link to={href} className="btn">{filter === 'pending' ? 'Flag or comment' : 'Open'}</Link>
                  {filter === 'pending' && <button className="primary" onClick={() => approve(o.id)}>✓ Approve</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
