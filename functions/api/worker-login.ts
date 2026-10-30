// POST /api/worker-login: checks a worker's link token and picture PIN, then
// returns a one-time token the app exchanges for a session.
import { json, serviceClient, type Env } from '../_shared';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => ({}))) as { member_id?: string; token?: string; pin?: string };
  if (!body.member_id || !body.token || !body.pin) return json({ error: 'bad_request' }, 400);

  const db = serviceClient(env);
  const { data: email, error } = await db.rpc('verify_worker_login', {
    p_member: body.member_id, p_token: body.token, p_pin: body.pin,
  });
  if (error || !email) {
    const code = error?.message ?? 'bad_link';
    return json({ error: code }, code === 'locked' ? 429 : 401);
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email: email as string });
  if (linkErr || !link.properties?.hashed_token) return json({ error: 'Could not sign in' }, 500);
  return json({ token_hash: link.properties.hashed_token });
};
