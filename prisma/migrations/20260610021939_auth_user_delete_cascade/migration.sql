-- Cascade Supabase Auth user deletion into the application data.
--
-- auth.users (managed by Supabase) and public."users" are separate tables. Deleting
-- an Auth user previously left the app User (and, for self-serve signups, their whole
-- Client + data) orphaned. This trigger deletes the app User and any Client they OWN
-- when their Auth identity is removed. Client deletion cascades to all client-scoped
-- data via the ON DELETE CASCADE foreign keys.
--
-- Note: public."users"."supabaseUserId" is text (cuid app ids), auth.users.id is uuid,
-- so we compare with a cast rather than a typed FK.

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE "supabaseUserId" = OLD.id::text;
  IF v_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Delete clients this user OWNS (cascades to all client-scoped data).
  DELETE FROM public.clients
  WHERE id IN (
    SELECT cu."clientId" FROM public.client_users cu
    WHERE cu."userId" = v_user_id AND cu.role = 'owner'
  );

  -- Delete the app user (cascades memberships & roles; nulls audit-log actor).
  DELETE FROM public.users WHERE id = v_user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- One-time cleanup: remove app users (and their owned clients) whose Supabase Auth
-- identity was ALREADY deleted before this trigger existed.
DELETE FROM public.clients c
WHERE EXISTS (
  SELECT 1 FROM public.client_users cu
  JOIN public.users u ON u.id = cu."userId"
  WHERE cu."clientId" = c.id
    AND cu.role = 'owner'
    AND u."supabaseUserId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = u."supabaseUserId")
);

DELETE FROM public.users u
WHERE u."supabaseUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = u."supabaseUserId");
