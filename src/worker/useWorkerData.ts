import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../auth';
import { TASK_SELECT, refreshOccurrences } from '../lib/data';
import { todayIn } from '../lib/dates';
import { flushPending, pendingList } from '../lib/offline';
import { must, supabase } from '../lib/supabase';
import type { Comment, Occurrence, TaskFull } from '../lib/types';

/** Today's and overdue tasks for the signed-in worker, kept fresh. */
export function useWorkerData() {
  const { member, household } = useMe();
  const today = todayIn(household.timezone);
  const [occ, setOcc] = useState<Occurrence[]>([]);
  const [tasks, setTasks] = useState<Map<string, TaskFull>>(new Map());
  const [comments, setComments] = useState<Comment[]>([]);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const load = useCallback(async () => {
    try {
      await flushPending();
      await refreshOccurrences();
      const list = must(await supabase.from('occurrences').select('*').eq('worker_id', member.id)
        .or(`and(status.eq.open,due_date.lte.${today}),and(status.eq.done,due_date.eq.${today}),and(status.eq.done,done_at.gte.${new Date(Date.now() - 12 * 3600_000).toISOString()})`)) as Occurrence[];
      const ids = [...new Set(list.map((o) => o.task_id))];
      const ts = ids.length ? (must(await supabase.from('tasks').select(TASK_SELECT).in('id', ids)) as TaskFull[]) : [];
      for (const t of ts) { t.task_media.sort((a, b) => a.position - b.position); t.task_steps.sort((a, b) => a.position - b.position); }
      const cs = ids.length
        ? (must(await supabase.from('comments').select('*').in('occurrence_id', list.map((o) => o.id)).order('created_at')) as Comment[])
        : [];
      setOcc(list);
      setTasks(new Map(ts.map((t) => [t.id, t])));
      setComments(cs);
      try { localStorage.setItem('handmaiden-worker-cache', JSON.stringify({ list, ts, cs })); } catch { /* full */ }
    } catch {
      // Offline: show the last list we had.
      try {
        const c = JSON.parse(localStorage.getItem('handmaiden-worker-cache') ?? 'null');
        if (c) { setOcc(c.list); setTasks(new Map((c.ts as TaskFull[]).map((t) => [t.id, t]))); setComments(c.cs); }
      } catch { /* nothing cached */ }
    }
    setQueued(new Set((await pendingList()).map((p) => p.occurrenceId)));
    setLoaded(true);
  }, [member.id, today]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`worker-${member.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences', filter: `worker_id=eq.${member.id}` }, () => load())
      .subscribe();
    const vis = () => document.visibilityState === 'visible' && load();
    const on = () => { setOffline(false); load(); };
    const off = () => setOffline(true);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load, member.id]);

  /** Shows a completion immediately, before the server confirms it. */
  const markLocal = (id: string, patch: Partial<Occurrence>) =>
    setOcc((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return { occ, tasks, comments, queued, loaded, offline, today, reload: load, markLocal, setQueued };
}
