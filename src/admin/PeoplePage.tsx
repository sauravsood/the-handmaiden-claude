import { useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { useMe } from '../auth';
import { loadMembers } from '../lib/data';
import { formatDateTime } from '../lib/dates';
import { uploadPhoto } from '../lib/media';
import { errorText, must, supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import type { Invite, Member } from '../lib/types';
import { Avatar, ErrorBox, Loading, Modal, PhotoInput } from '../components/ui';
import { PicturePin, pinIcons } from '../components/PicturePin';

export function PeoplePage() {
  const { member: me, household } = useMe();
  const [adding, setAdding] = useState(false);
  const [qrFor, setQrFor] = useState<Member | null>(null);
  const d = useAsync(async () => {
    const [members, invites] = await Promise.all([
      loadMembers(),
      supabase.from('admin_invites').select('*').is('accepted_at', null).order('created_at').then((r) => must(r) as Invite[]),
    ]);
    return { members, invites };
  }, []);

  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const admins = d.data.members.filter((m) => m.role !== 'worker');
  const workers = d.data.members.filter((m) => m.role === 'worker');

  return (
    <div className="stack lg" style={{ maxWidth: 820 }}>
      <div className="page-head"><h1>People</h1></div>

      <section className="stack">
        <div className="row between">
          <h2>Workers</h2>
          <button className="primary" onClick={() => setAdding(true)}>＋ Add worker</button>
        </div>
        <div className="list">
          {workers.length === 0 && <div className="empty">No workers yet.</div>}
          {workers.map((w) => (
            <Link key={w.id} to={`/admin/people/${w.id}`} className="item">
              <Avatar member={w} size={44} />
              <div className="grow">
                <div className="title">{w.display_name}</div>
                <small>{w.active ? 'Active' : 'Inactive'}</small>
              </div>
              <button className="small" onClick={(e) => { e.preventDefault(); setQrFor(w); }}>Sign-in QR</button>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Admins</h2>
        <div className="list">
          {admins.map((a) => (
            <div key={a.id} className="item">
              <Avatar member={a} />
              <div className="grow"><div className="title">{a.display_name}</div><small>{a.email}</small></div>
              <span className="pill">{a.role}</span>
            </div>
          ))}
          {d.data.invites.map((i) => (
            <div key={i.id} className="item">
              <span className="avatar">✉</span>
              <div className="grow"><div className="title">{i.email}</div><small>Invited {formatDateTime(i.created_at, household.timezone)}, not signed in yet</small></div>
              <button className="small ghost" onClick={async () => { await supabase.from('admin_invites').delete().eq('id', i.id); d.reload(); }}>Cancel</button>
            </div>
          ))}
        </div>
        <InviteForm householdId={household.id} myId={me.id} onDone={d.reload} />
      </section>

      {adding && <AddWorker onClose={() => setAdding(false)} onCreated={(w) => { setAdding(false); d.reload(); setQrFor(w); }} />}
      {qrFor && <Modal title={`Sign-in QR for ${qrFor.display_name}`} onClose={() => setQrFor(null)}><WorkerQR worker={qrFor} /></Modal>}
    </div>
  );
}

function InviteForm({ householdId, myId, onDone }: { householdId: string; myId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    const { error: err } = await supabase.from('admin_invites').insert({ household_id: householdId, email: em, invited_by: myId });
    if (err) return setError(err.message);
    setEmail('');
    setError(null);
    setSent(em);
    onDone();
  };
  return (
    <form className="card stack" onSubmit={invite}>
      <h3>Invite an admin</h3>
      <div className="row">
        <input id="inv-email" type="email" required placeholder="name@example.com" className="grow" style={{ width: 'auto' }} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary">Invite</button>
      </div>
      {sent && <div className="notice">Ask {sent} to open <strong>{window.location.origin}/admin</strong> and sign in with that email. They join automatically.</div>}
      <ErrorBox error={error} />
    </form>
  );
}

function AddWorker({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Member) => void }) {
  const { household } = useMe();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return setError('Enter a name.');
    if (!pin) return setError('Choose a picture code.');
    setBusy(true);
    setError(null);
    try {
      const photo_path = photo ? await uploadPhoto(household.id, 'people', photo) : null;
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ display_name: name.trim(), photo_path }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not add worker (${res.status})`);
      const { error: e } = await supabase.rpc('set_worker_pin', { p_member: body.member.id, p_pin: pin });
      if (e) throw new Error(e.message);
      onCreated(body.member as Member);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add worker" onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <PhotoInput camera onPick={([f]) => setPhoto(f)}>
          <div className="photo-slot" role="button" tabIndex={0}>
            {photo ? <img src={URL.createObjectURL(photo)} alt="" /> : '📷 Photo'}
          </div>
        </PhotoInput>
        <label className="field grow"><span>Name</span>
          <input id="aw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha" />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <small>Picture code: tap 4 pictures. The worker taps the same 4 to sign in on a new phone.</small>
        {pin ? (
          <div className="row"><span style={{ fontSize: 32 }}>{pinIcons(pin)}</span><button className="small" onClick={() => setPin(null)}>Change</button></div>
        ) : (
          <PicturePin small onComplete={setPin} />
        )}
      </div>
      <ErrorBox error={error} />
      <div className="row">
        <button className="primary" disabled={busy} onClick={create}>{busy ? 'Adding…' : 'Add worker'}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/** Issues a fresh sign-in link and shows it as a QR code. */
export function WorkerQR({ worker }: { worker: Member }) {
  const [state, setState] = useState<{ url: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    const { data, error: e } = await supabase.rpc('issue_device_link', { p_member: worker.id });
    if (e) return setError(errorText(new Error(e.message)));
    const url = `${window.location.origin}/w/link#${worker.id}.${data}`;
    setState({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 480 }) });
  };
  if (!state) {
    return (
      <div className="stack">
        <p>Creating a new QR code stops any earlier QR code from working. Phones that are already signed in stay signed in.</p>
        <ErrorBox error={error} />
        <div><button className="primary" onClick={make}>Create QR code</button></div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <img className="qr" src={state.qr} alt="Sign-in QR code" />
      <p style={{ textAlign: 'center' }}>Scan this with {worker.display_name}'s phone camera, then they tap their picture code. Add the page to the home screen afterwards.</p>
      <div className="row">
        <input readOnly value={state.url} onFocus={(e) => e.target.select()} style={{ width: 260 }} />
        <button onClick={async () => {
          try { await navigator.clipboard.writeText(state.url); setCopied(true); } catch { /* select instead */ }
        }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <small>You can also send this link on WhatsApp. Keep it private: it works with the picture code.</small>
    </div>
  );
}
