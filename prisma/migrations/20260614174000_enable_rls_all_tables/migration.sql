-- Enable Row Level Security on every public table.
--
-- Supabase flags tables without RLS as "Unrestricted" (red): with RLS off, anyone holding the
-- public anon key could read/write them through the auto-generated PostgREST data API.
-- PageBee never uses that data API — all access goes through the Next.js server via Prisma, which
-- connects as `postgres` (owner + BYPASSRLS), so it is unaffected. Enabling RLS with NO policies
-- means the PostgREST `anon`/`authenticated` roles get deny-all, closing the hole.
--
-- NOTE: new tables added by future migrations also need RLS — add an ENABLE ROW LEVEL SECURITY
-- line for each (or re-run this block).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;
