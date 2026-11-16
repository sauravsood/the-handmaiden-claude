import { useState } from 'react';
import { useMe } from '../auth';
import { uploadPhoto } from '../lib/media';
import { errorText, must, supabase } from '../lib/supabase';
import type { Occurrence } from '../lib/types';
import { ErrorBox, Modal, PhotoInput } from '../components/ui';

/** True when someone other than the assigned worker (an admin) ticked it. */
export function doneByAdmin(o: Pick<Occurrence, 'status' | 'done_by' | 'worker_id'>) {
  return o.status === 'done' && !!o.done_by && o.done_by !== o.worker_id;
}

/**
 * Lets an admin mark a worker's task as done, for when the worker did it but
 * did not tick it, or someone else did it. It is recorded as done by the admin
 * and approved, and needs no photo even on photo-proof tasks.
 */
export function MarkDoneDialog({ o, title, workerName, onClose, onDone }: {
  o: Occurrence; title: string; workerName?: string; onClose: () => void; onDone: () => void;
}) {
  const { member: me, household } = useMe();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const path = photo ? await uploadPhoto(household.id, 'proof', photo) : null;
      const { error: e } = await supabase.rpc('complete_occurrence', { p_id: o.id, p_proof_path: path });
      if (e) throw new Error(e.message);
      if (note.trim()) {
        must(await supabase.from('comments').insert({
          household_id: household.id, task_id: o.task_id, occurrence_id: o.id, author_id: me.id,
          kind: 'comment', body: note.trim(),
        }));
      }
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Mark as done" onClose={onClose}>
      <p><strong>{title}</strong>{workerName ? ` · ${workerName}` : ''}</p>
      <p className="muted">
        Use this when the task was done but not ticked on the worker's phone. It is recorded as marked done
        by you, so it stays clear in the history and analytics.
      </p>
      <label className="field"><span>Note (optional)</span>
        <textarea id="md-note" value={note} placeholder="For example: she did it but forgot to tap" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <PhotoInput onPick={(f) => setPhoto(f[0])}>
          <button type="button">{photo ? '📷 Change photo' : '📷 Add a photo (optional)'}</button>
        </PhotoInput>
        {photo && <small>{photo.name}</small>}
      </div>
      <ErrorBox error={error} />
      <div className="row">
        <button className="primary" disabled={busy} onClick={run}>{busy ? 'Saving…' : '✓ Mark as done'}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
