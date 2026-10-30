import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setMember(null);
      setHousehold(null);
      setLoading(false);
      return;
    }
    let { data: m } = await supabase.from('members').select('*').eq('user_id', s.user.id).maybeSingle();
    if (!m) {
      // An admin who was invited by email joins on first sign-in.
      const { data } = await supabase.rpc('accept_invite', { p_display_name: null });
      m = data && (data as Member).id ? data : null;
    }
    setMember((m as Member) ?? null);
    if (m) {
      const { data: h } = await supabase.from('households').select('*').eq('id', (m as Member).household_id).single();
      setHousehold(h as Household);
    } else {
      setHousehold(null);
    }
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
