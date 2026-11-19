import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Throws the Supabase error, so callers can use plain try/catch. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const FRIENDLY: Record<string, string> = {
  photo_required: 'This task needs a photo before it can be marked done.',
  not_allowed: "You don't have permission to do that.",
  not_found: 'That item no longer exists.',
  too_late: 'It is too late to undo this.',
  already_member: 'This account already belongs to a household.',
  bad_pin: 'That picture code is wrong.',
  bad_link: 'This sign-in link no longer works. Ask for a new QR code.',
  locked: 'Too many wrong tries. Wait 15 minutes.',
};

// What browsers say when a request never got an answer (Safari/iOS, Chrome, Firefox).
const NETWORK = /^(TypeError: )?(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|Network request failed)$/i;

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (NETWORK.test(msg)) return "Couldn't reach the server. Check the internet connection and try again.";
  return FRIENDLY[msg] ?? msg;
}
