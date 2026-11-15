// POST /api/workers: an admin adds a worker. Workers get a login account
// with a placeholder email; they sign in with a QR link and a picture PIN.
//
// The worker and their picture code are saved in this one request, so a
// dropped connection can't leave a worker without a code. The browser sends
// a request_id (a UUID made when the dialog opens) that becomes the worker's
// user id; sending the same request again after a network error returns the
// worker already made instead of adding a duplicate.
import { json, requireAdmin, serviceClient, userClient, type Env } from '../_shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN = /^[0-8](-[0-8]){3}$/;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const db = serviceClient(env);
  const admin = await requireAdmin(request, db);
  if (!admin) return json({ error: 'not_allowed' }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    display_name?: string; photo_path?: string | null; pin?: string; request_id?: string;
  };
  const name = body.display_name?.trim();
  if (!name) return json({ error: 'Name is required' }, 400);
  if (!body.pin || !PIN.test(body.pin)) return json({ error: 'Choose a picture code.' }, 400);
  const requestId = body.request_id && UUID.test(body.request_id) ? body.request_id.toLowerCase() : crypto.randomUUID();
  const photo = body.photo_path && body.photo_path.startsWith(`${admin.household_id}/`) ? body.photo_path : null;

  // Set the code as the calling admin, through the same checked function the app uses.
  const jwt = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  const setPin = (memberId: string) =>
    userClient(env, jwt).rpc('set_worker_pin', { p_member: memberId, p_pin: body.pin });

  // A retry of a request that already got this far: finish it and return the same worker.
  const { data: existing } = await db.from('members').select('*').eq('user_id', requestId).maybeSingle();
  if (existing) {
    if (existing.household_id !== admin.household_id || existing.role !== 'worker') {
      return json({ error: 'not_allowed' }, 403);
    }
    const { error: pErr } = await setPin(existing.id);
    if (pErr) return json({ error: pErr.message }, 500);
    return json({ member: existing });
  }

  const email = `worker-${requestId}@workers.handmaiden.invalid`;
  const { data: created, error } = await db.auth.admin.createUser({
    id: requestId, email, email_confirm: true, user_metadata: { worker: true, display_name: name },
  });
  if (error || !created.user) return json({ error: error?.message ?? 'Could not create worker' }, 500);

  const { data: member, error: mErr } = await db.from('members').insert({
    household_id: admin.household_id, user_id: created.user.id, role: 'worker',
    display_name: name, photo_path: photo,
  }).select('*').single();
  if (mErr) {
    await db.auth.admin.deleteUser(created.user.id);
    return json({ error: mErr.message }, 500);
  }

  const { error: pErr } = await setPin(member.id);
  if (pErr) {
    await db.from('members').delete().eq('id', member.id);
    await db.auth.admin.deleteUser(created.user.id);
    return json({ error: pErr.message }, 500);
  }

  await db.from('activity').insert({
    household_id: admin.household_id, actor_id: admin.id, action: 'worker_added', details: { name },
  });
  return json({ member });
};
