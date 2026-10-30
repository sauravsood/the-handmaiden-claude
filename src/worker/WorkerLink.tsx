import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase, errorText } from '../lib/supabase';
import { Avatar } from '../components/ui';
import { PicturePin } from '../components/PicturePin';

const KEY = 'handmaiden-link';

function readLink(): { member: string; token: string } | null {
  const hash = window.location.hash.slice(1);
  if (hash.includes('.')) {
    const [member, token] = hash.split('.');
    try { localStorage.setItem(KEY, JSON.stringify({ member, token })); } catch { /* private mode */ }
    window.history.replaceState(null, '', '/w/link');
    return { member, token };
  }
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

/** Opened from the QR code: shows the worker's face, then the picture code. */
export function WorkerLink() {
  const nav = useNavigate();
  const { member } = useAuth();
  const [link] = useState(readLink);
  const [info, setInfo] = useState<{ display_name: string; photo_path: string | null } | null | undefined>(undefined);
  const [state, setState] = useState<'idle' | 'busy' | 'wrong' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!link) { setInfo(null); return; }
    supabase.rpc('worker_link_info', { p_member: link.member, p_token: link.token })
      .then(({ data }) => setInfo((data as typeof info) ?? null));
  }, [link]);

  useEffect(() => {
    if (member?.role === 'worker' && member.id === link?.member) nav('/w', { replace: true });
  }, [member, link, nav]);

  const submit = async (pin: string) => {
    if (!link) return;
    setState('busy');
    try {
      const res = await fetch('/api/worker-login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member_id: link.member, token: link.token, pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === 'bad_pin') { setState('wrong'); return; }
        throw new Error(body.error ?? 'Sign-in failed');
      }
      // Sign out any admin session on this phone first.
      await supabase.auth.signOut({ scope: 'local' });
      const { error: e } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' });
      if (e) throw new Error(e.message);
      nav('/w', { replace: true });
    } catch (e) {
      setError(errorText(e));
      setState('error');
    }
  };

  if (info === undefined) return <div className="worker" />;
  if (!link || info === null) {
    return (
      <div className="worker center-page" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 80 }} aria-hidden="true">🔳 ❌</div>
        <p style={{ fontSize: 18 }}>This QR code no longer works. Ask for a new one.</p>
      </div>
    );
  }
  return (
    <div className="worker" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Avatar member={info} size={120} />
        <h1 style={{ fontSize: 28 }}>{info.display_name}</h1>
        {state === 'wrong' && <div style={{ fontSize: 48 }} role="alert" aria-label="Wrong code">❌</div>}
        {state === 'error' && <div className="error">{error}</div>}
      </div>
      <PicturePin onComplete={submit} disabled={state === 'busy'} />
    </div>
  );
}
