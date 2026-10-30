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
      <aside className="sidebar">
        <div className="brand">Hand<span>maiden</span></div>
        <nav className="nav">
          <NavLink to="/admin" end>Today</NavLink>
          <NavLink to="/admin/tasks">Tasks</NavLink>
          <NavLink to="/admin/review">Review {pending > 0 && <span className="pill warn">{pending}</span>}</NavLink>
          <NavLink to="/admin/people">People</NavLink>
          <NavLink to="/admin/analytics">Analytics</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <div className="foot">
          <div><strong>{household.name}</strong><br /><span className="muted">{member.display_name} · {member.role}</span></div>
          <button className="small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">{ready ? <Outlet /> : null}</main>
    </div>
  );
}
