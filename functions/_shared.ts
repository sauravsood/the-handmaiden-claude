import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export function serviceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Returns the calling admin's member row, or null. */
export async function requireAdmin(req: Request, db: SupabaseClient) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: user } = await db.auth.getUser(jwt);
  if (!user.user) return null;
  const { data: m } = await db.from('members').select('id, household_id, role, active')
    .eq('user_id', user.user.id).maybeSingle();
  if (!m || !m.active || (m.role !== 'owner' && m.role !== 'admin')) return null;
  return m as { id: string; household_id: string; role: string };
}
