# Deploying to tasks.sauravsood.com

About 15 minutes. You need a Supabase account and the Cloudflare account that holds `sauravsood.com`. Any subdomain works; `tasks.sauravsood.com` is used below.

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard). Pick the region closest to the household (for India, Mumbai `ap-south-1`).
2. **Database > Extensions**: enable `pg_cron`.
3. **SQL Editor**: run each file in `supabase/migrations/` in order (copy, paste, Run):
   - `20261030000001_init.sql`
   - `20261030000002_schedule_job.sql`

   Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
4. **Authentication > URL Configuration**:
   - Site URL: `https://tasks.sauravsood.com`
   - Redirect URLs: add `https://tasks.sauravsood.com/**`
5. **Authentication > Providers > Email**: keep it on. Turning off "Confirm email" is not needed; admins sign in by magic link.
6. **Project Settings > API Keys > Legacy API Keys**: you will copy two keys from here in the Cloudflare step:
   - `anon` (public, safe to put in the web app)
   - `service_role` (secret, never share it)

   The Project URL (`https://<ref>.supabase.co`) is under **Project Settings > Data API**.

The default Supabase email sender is limited to a few emails an hour. For more admins, add your own SMTP under **Authentication > Emails**.

## 2. Cloudflare Pages

1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**, and choose `sauravsood/the-handmaiden-claude`.
2. Build settings:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. On the same screen, open **Environment variables (advanced)** and click **Add variable** four times. Type the name in the left box and paste the value from Supabase in the right box:

   | Variable name | Value to paste | Type |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` | Text |
   | `VITE_SUPABASE_ANON_KEY` | the `anon` key | Text |
   | `SUPABASE_URL` | the same Project URL again | Text |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **Secret** (click Encrypt) |

   The first two are built into the web page. The last two are only used by the server code that adds and signs in workers. Nobody else needs to see these values, including Claude.

4. Save and deploy. Every merge to `main` deploys again.
5. In the Pages project, **Custom domains** > **Set up a custom domain** > `tasks.sauravsood.com`. Because the domain is already on Cloudflare, the DNS record and HTTPS certificate are created for you.

## 3. First use

1. Open `https://tasks.sauravsood.com/admin`, enter your email, open the link, and create the household.
2. **People > Add worker**: take their photo and pick a four-picture code.
3. Scan the QR code with the worker's phone, tap the code, then use the browser's "Add to home screen".
4. Invite other admins under **People**. They sign in with the invited email and join automatically.
