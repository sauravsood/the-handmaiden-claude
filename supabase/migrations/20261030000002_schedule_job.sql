-- Hourly job that creates each household's occurrences once its local day
-- starts. Requires the pg_cron extension (Database > Extensions in Supabase).
create extension if not exists pg_cron;

select cron.schedule('handmaiden-occurrences', '5 * * * *', $$select public.ensure_occurrences_all()$$);
