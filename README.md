# Handmaiden

A household task app with two sides on one web address:

- **Admin side** (`/admin`): admins create recurring or one-off tasks with photos, assign them to one or more workers, review completions, and see analytics.
- **Worker side** (`/w`): a picture-first list of today's tasks that works without reading. Workers sign in with a QR code and a four-picture code, tap a photo to see the task, and tap the big tick when done.

## Features (version 1)

- Several admins per household (invite by email) and any number of workers.
- Tasks with a cover photo, up to four more photos, picture steps, priority (P1 to P4), labels, and time of day.
- Schedules: one-off on a date, or repeating every N days, weeks, months or years, on chosen weekdays, days of the month (including the last day) and months. Repeats can follow fixed dates or count from the last completion.
- Assigning a task to several workers creates an independent copy for each. Edits can be applied to all copies.
- "Photo required when done" per task: only those tasks ask the worker for a photo.
- Review: approve or flag a completion, comment (with photos), create a linked follow-up task, or reopen and send it back with updated requirements. Earlier attempts and earlier versions of the task are kept, like issue history in Jira.
- Today board, upcoming and overdue lists, skip, worker leave, activity log.
- Analytics: completion and on-time rates, missed and flagged counts, redos, average delay, streaks, workload, time of day, task health, proof photo gallery, CSV export.
- Read aloud: a 🔊 button on each task photo reads the task to the worker. Each worker can have a language (Hindi or English, set when adding them or on their page); task text is translated into it with Cloudflare Workers AI. With no language set, tasks are read as typed.
- Worker app installs to the home screen, keeps working offline and sends ticks when the signal returns.

## Stack

- React + TypeScript + Vite, hosted on **Cloudflare Pages**.
- **Supabase** for Postgres (with row-level security), auth, photo storage and live updates.
- Cloudflare Pages Functions (`functions/api`): adding a worker and signing a worker in (these need the Supabase service key), and translating task text for read-aloud (Workers AI binding `AI` in `wrangler.toml`).

## Development

```sh
npm install
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm run dev
```

The worker endpoints run under Wrangler: `npx wrangler pages dev -- npm run dev` with `.dev.vars` (see `.dev.vars.example`).

Tests:

```sh
npm test                 # schedule logic
npm run test:sql         # database tests on a local Postgres (set PGHOST/PGPORT)
```

With `PGHOST` set, `npm test` also checks that the TypeScript and SQL schedule rules agree on hundreds of random schedules.

See [DEPLOY.md](DEPLOY.md) to put it on a subdomain of your Cloudflare domain.
