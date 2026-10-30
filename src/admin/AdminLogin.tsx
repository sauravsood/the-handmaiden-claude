import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { ErrorBox } from '../components/ui';

export function AdminLogin() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session) return <Navigate to="/admin" replace />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setBusy(false);
    if (err) setError(err.message); else setSent(true);
  };

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={send}>
        <h1>Hand<span style={{ color: 'var(--accent)' }}>maiden</span></h1>
        <p className="muted">Sign in to manage your household's tasks.</p>
        {sent ? (
          <div className="notice">We sent a sign-in link to <strong>{email}</strong>. Open it on this device.</div>
        ) : (
          <>
            <label className="field"><span>Email</span>
              <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <ErrorBox error={error} />
            <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Workers sign in by scanning the QR code an admin gives them.</p>
      </form>
    </div>
  );
}
