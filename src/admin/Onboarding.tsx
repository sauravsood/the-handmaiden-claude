import { useState } from 'react';
import { useAuth } from '../auth';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox } from '../components/ui';

export function Onboarding() {
  const { session, reload, signOut } = useAuth();
  const [name, setName] = useState('');
  const [home, setHome] = useState('');
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.rpc('create_household', { p_name: home.trim(), p_timezone: tz, p_display_name: name.trim() });
    setBusy(false);
    if (err) setError(errorText(new Error(err.message))); else reload();
  };

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={create}>
        <h1>Set up your household</h1>
        <p className="muted">Signed in as {session?.user.email}. If another admin invited you, ask them to check the email they used.</p>
        <label className="field"><span>Your name</span><input id="ob-name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Household name</span><input id="ob-home" required placeholder="Sood home" value={home} onChange={(e) => setHome(e.target.value)} /></label>
        <label className="field"><span>Time zone</span><input id="ob-tz" required value={tz} onChange={(e) => setTz(e.target.value)} /></label>
        <ErrorBox error={error} />
        <button className="primary" disabled={busy}>Create household</button>
        <button type="button" className="ghost" onClick={signOut}>Sign out</button>
      </form>
    </div>
  );
}
