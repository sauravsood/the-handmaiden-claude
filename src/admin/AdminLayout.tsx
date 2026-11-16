import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMe, useAuth } from '../auth';
import { refreshOccurrences } from '../lib/data';
import { supabase } from '../lib/supabase';

export function AdminLayout() {
  const { member, household } = useMe();
  const { signOut } = useAuth();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    refreshOccurrences().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const count = async () => {
      const { count: n } = await supabase.from('occurrences').select('id', { count: 'exact', head: true })
        .eq('status', 'done').eq('review_status', 'pending');
      setPending(n ?? 0);
    };
    count();
    const ch = supabase.channel('review-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, count)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand"><img src="/icon.svg" alt="" /><div>Hand<span>maiden</span></div></div>
        <span className="hh">{household.name}</span>
      </header>
      <aside className="sidebar">
        <div className="brand"><img src="/icon.svg" alt="" /><div>Hand<span>maiden</span></div></div>
        <nav className="nav">
          <NavLink to="/admin" end>{ICONS.today}<span className="lbl">Today</span></NavLink>
          <NavLink to="/admin/tasks">{ICONS.tasks}<span className="lbl">Tasks</span></NavLink>
          <NavLink to="/admin/review">{ICONS.review}<span className="lbl">Review</span>{pending > 0 && <span className="count">{pending}</span>}</NavLink>
          <NavLink to="/admin/people">{ICONS.people}<span className="lbl">People</span></NavLink>
          <NavLink to="/admin/analytics">{ICONS.analytics}<span className="lbl">Analytics</span></NavLink>
          <NavLink to="/admin/settings">{ICONS.settings}<span className="lbl">Settings</span></NavLink>
        </nav>
        <div className="foot">
          <div className="who"><strong>{household.name}</strong><span className="muted">{member.display_name} · {member.role}</span></div>
          <button className="small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">{ready ? <Outlet /> : null}</main>
    </div>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }} />
);

const ICONS = {
  today: icon('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'),
  tasks: icon('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>'),
  review: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  people: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  analytics: icon('<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>'),
};
