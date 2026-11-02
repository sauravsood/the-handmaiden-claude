import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import type { Household, Member } from './lib/types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  member: Member | null;
  household: Household | null;
  /** Reloads the member and household after onboarding or edits. */
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  // Each load gets a number so a slow, older load cannot overwrite a newer one.
  const loadSeq = useRef(0);

  const load = useCallback(async (s: Session | null) => {
    const seq = ++loadSeq.current;
    let m: Member | null = null;
    let h: Household | null = null;
    if (s) {
      const { data } = await supabase.from('members').select('*').eq('user_id', s.user.id).maybeSingle();
      m = (data as Member) ?? null;
      if (!m) {
        // An admin who was invited by email joins on first sign-in.
        const { data: inv } = await supabase.rpc('accept_invite', { p_display_name: null });
        m = inv && (inv as Member).id ? (inv as Member) : null;
      }
      if (m) {
        const { data: hh } = await supabase.from('households').select('*').eq('id', m.household_id).maybeSingle();
        h = (hh as Household) ?? null;
      }
    }
    if (seq !== loadSeq.current) return;
    // Set member and household together, so screens never see a member without a household.
    setMember(m);
    setHousehold(h);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setLoading(true);
        // Let the auth client finish before querying with the new session.
        setTimeout(() => load(s), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value: AuthState = {
    loading, session, member, household,
    reload: () => load(session),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The signed-in member and household, for screens behind a guard. */
export function useMe(): { member: Member; household: Household } {
  const { member, household } = useAuth();
  if (!member || !household) throw new Error('useMe used without a member');
  return { member, household };
}
