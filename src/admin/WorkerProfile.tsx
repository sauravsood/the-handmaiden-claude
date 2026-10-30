import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '../auth';
import { loadOccurrences, loadTasks } from '../lib/data';
import { addDays, todayIn } from '../lib/dates';
import { formatDay } from '../lib/schedule';
import { uploadPhoto } from '../lib/media';
import { errorText, must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Leave, Member } from '../lib/types';
import { Avatar, ErrorBox, Loading, Modal, PhotoInput } from '../components/ui';
import { PicturePin } from '../components/PicturePin';
import { WorkerQR } from './PeoplePage';
import { computeStats, pct } from './stats';

export function WorkerProfile() {
  const { id } = useParams();
  const { household } = useMe();
  const today = todayIn(household.timezone);
  const [modal, setModal] = useState<'qr' | 'pin' | 'revoke' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [note, setNote] = useState('');

  const d = useAsync(async () => {
    const [w, leave, occ, tasks] = await Promise.all([
      supabase.from('members').select('*').eq('id', id!).single().then((r) => must(r) as Member),
      supabase.from('leave').select('*').eq('worker_id', id!).order('from_date', { ascending: false }).then((r) => must(r) as Leave[]),
      loadOccurrences({ workerId: id, from: addDays(today, -29), to: today }),
      loadTasks(),
    ]);
    return { w, leave, occ, tasks: tasks.filter((t) => t.worker_id === id) };
  }, [id, today]);

  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { w, leave, occ, tasks } = d.data;
  const s = computeStats(occ, today, household.timezone);

  const update = async (patch: Partial<Member>) => {
    const { error: e } = await supabase.from('members').update(patch).eq('id', w.id);
    if (e) setError(e.message); else d.reload();
  };
  const addLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error: err } = await supabase.from('leave').insert({ household_id: household.id, worker_id: w.id, from_date: from, to_date: to, note: note || null });
    if (err) return setError(err.message);
    // Tasks already created for leave days are skipped.
    const open = await loadOccurrences({ workerId: w.id, from, to, status: ['open'] });
    for (const o of open) await supabase.rpc('skip_occurrence', { p_id: o.id, p_reason: 'On leave' });
    setNote('');
    d.reload();
  };

  return (
    <div className="stack lg" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div className="row">
          <Link to="/admin/people" className="btn ghost">←</Link>
          <Avatar member={w} size={56} />
          <div>
            <h1>{w.display_name}</h1>
            <small>{w.active ? 'Active worker' : 'Inactive'} · {tasks.length} tasks</small>
          </div>
        </div>
        <div className="row">
          <PhotoInput camera onPick={async ([f]) => update({ photo_path: await uploadPhoto(household.id, 'people', f) })}>
            <button>Change photo</button>
          </PhotoInput>
          <button onClick={() => {
            const n = window.prompt?.('Name', w.display_name);
            if (n && n.trim()) update({ display_name: n.trim() });
          }}>Rename</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {msg && <div className="notice">{msg}</div>}

      <div className="stat-row">
        <div className="stat"><div className="v">{pct(s.completionRate)}</div><div className="l">Done, last 30 days</div></div>
        <div className="stat"><div className="v">{pct(s.onTimeRate)}</div><div className="l">On time</div></div>
        <div className="stat"><div className="v">{s.flagged}</div><div className="l">Flagged</div></div>
        <div className="stat"><div className="v">{s.streak}</div><div className="l">Day streak, all done</div></div>
      </div>
      <div><Link to={`/admin/analytics?worker=${w.id}`}>Full analytics →</Link></div>

      <section className="card stack">
        <h2>Sign-in</h2>
        <div className="row">
          <button className="primary" onClick={() => setModal('qr')}>New sign-in QR</button>
          <button onClick={() => setModal('pin')}>Reset picture code</button>
          <button className="danger" onClick={() => setModal('revoke')}>Sign out all phones</button>
          <button onClick={() => update({ active: !w.active })}>{w.active ? 'Deactivate' : 'Reactivate'}</button>
        </div>
        {!w.active && <small>Inactive workers cannot sign in. Their tasks stay in history.</small>}
      </section>

      <section className="card stack">
        <h2>Leave</h2>
        <p className="muted">No tasks are created for leave days, and tasks already due on those days are skipped.</p>
        <form className="row" onSubmit={addLeave}>
          <input id="lv-from" type="date" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>to</span>
          <input id="lv-to" type="date" style={{ width: 'auto' }} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <input id="lv-note" style={{ width: 180 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="primary">Add leave</button>
        </form>
        {leave.length > 0 && (
          <div className="list">
            {leave.map((l) => (
              <div key={l.id} className="item">
                <div className="grow">{formatDay(l.from_date)} to {formatDay(l.to_date)} {l.note && <small>· {l.note}</small>}</div>
                {l.to_date >= today && <button className="small ghost" onClick={async () => { await supabase.from('leave').delete().eq('id', l.id); d.reload(); }}>Remove</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {modal === 'qr' && <Modal title={`Sign-in QR for ${w.display_name}`} onClose={() => setModal(null)}><WorkerQR worker={w} /></Modal>}
      {modal === 'pin' && (
        <Modal title="New picture code" onClose={() => setModal(null)}>
          <p>Tap 4 pictures. Tell {w.display_name} the new code in person.</p>
          <PicturePin small onComplete={async (pin) => {
            const { error: e } = await supabase.rpc('set_worker_pin', { p_member: w.id, p_pin: pin });
            setModal(null);
            if (e) setError(errorText(new Error(e.message))); else setMsg('Picture code changed.');
          }} />
        </Modal>
      )}
      {modal === 'revoke' && (
        <Modal title="Sign out all phones" onClose={() => setModal(null)}>
          <p>{w.display_name} is signed out on every phone and the current QR code stops working. Create a new QR code to sign in again.</p>
          <div className="row">
            <button className="danger" onClick={async () => {
              const { error: e } = await supabase.rpc('revoke_worker_devices', { p_member: w.id });
              setModal(null);
              if (e) setError(errorText(new Error(e.message))); else setMsg('Signed out everywhere.');
            }}>Sign out everywhere</button>
            <button onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
