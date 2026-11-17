-- The language a worker hears tasks in (read aloud on the worker screen).
-- null means "as the admin typed it": the task text is read without translation.
alter table public.members
  add column language text check (language in ('en', 'hi'));
