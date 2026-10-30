import { useState } from 'react';
import { useMe } from '../auth';
import { formatDateTime } from '../lib/dates';
import { uploadPhoto } from '../lib/media';
import { must, supabase } from '../lib/supabase';
import type { Comment, Member } from '../lib/types';
import { Avatar, ErrorBox, Photo, PhotoInput } from '../components/ui';

const KIND: Record<Comment['kind'], { label: string; cls: string }> = {
  comment: { label: '', cls: '' },
  approve: { label: 'Approved', cls: 'good' },
  flag: { label: 'Flagged', cls: 'bad' },
  reopen: { label: 'Sent back', cls: 'warn' },
  followup: { label: 'Follow-up task', cls: 'accent' },
};

export function CommentList({ comments, members, taskId, occurrenceId, onAdded }: {
  comments: Comment[]; members: Map<string, Member>; taskId: string; occurrenceId?: string; onAdded: () => void;
}) {
  const { member, household } = useMe();
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() && !photo) return;
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(household.id, 'comments', photo) : null;
      must(await supabase.from('comments').insert({
        household_id: household.id, task_id: taskId, occurrence_id: occurrenceId ?? null,
        author_id: member.id, body: body.trim(), photo_path,
      }));
      setBody('');
      setPhoto(null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {comments.length > 0 && (
        <div className="timeline">
          {comments.map((c) => (
            <div key={c.id} className="ev">
              <Avatar member={members.get(c.author_id ?? '')} size={28} />
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row">
                  <strong>{members.get(c.author_id ?? '')?.display_name ?? 'Someone'}</strong>
                  {KIND[c.kind].label && <span className={`pill ${KIND[c.kind].cls}`}>{KIND[c.kind].label}</span>}
                  <small>{formatDateTime(c.created_at, household.timezone)}</small>
                </div>
                {c.body && <p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>}
                {c.photo_path && <div className="thumb" style={{ width: 120, height: 120 }}><Photo path={c.photo_path} /></div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <form className="stack" onSubmit={add}>
        <textarea id={`cm-${occurrenceId ?? taskId}`} placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 60 }} />
        <div className="row">
          <PhotoInput onPick={([f]) => setPhoto(f)}><button type="button" className="small">{photo ? `📷 ${photo.name.slice(0, 18)}` : '📷 Attach photo'}</button></PhotoInput>
          <button className="small primary" disabled={busy || (!body.trim() && !photo)}>Comment</button>
        </div>
        <ErrorBox error={error} />
      </form>
    </div>
  );
}
