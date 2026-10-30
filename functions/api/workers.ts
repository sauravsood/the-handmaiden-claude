// POST /api/workers: an admin adds a worker. Workers get a login account
// with a placeholder email; they sign in with a QR link and a picture PIN.
import { json, requireAdmin, serviceClient, type Env } from '../_shared';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const db = serviceClient(env);
  const admin = await requireAdmin(request, db);
  if (!admin) return json({ error: 'not_allowed' }, 403);

  const body = (await request.json().catch(() => ({}))) as { display_name?: string; photo_path?: string | null };
  const name = body.display_name?.trim();
  if (!name) return json({ error: 'Name is required' }, 400);
  const photo = body.photo_path && body.photo_path.startsWith(`${admin.household_id}/`) ? body.photo_path : null;

  const email = `worker-${crypto.randomUUID()}@workers.handmaiden.invalid`;
  const { data: created, error } = await db.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { worker: true, display_name: name },
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
  await db.from('activity').insert({
    household_id: admin.household_id, actor_id: admin.id, action: 'worker_added', details: { name },
  });
  return json({ member });
};
