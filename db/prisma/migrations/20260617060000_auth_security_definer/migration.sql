-- Auth helper functions (SECURITY DEFINER) to resolve users BEFORE a tenant
-- context exists. app_user is FORCE-RLS, so the restricted app role cannot read
-- it directly. These functions run with the owner's privileges and expose ONLY
-- the three narrow operations the auth flow needs. They are the single
-- controlled exception to tenant isolation, used exclusively by login/refresh.

-- Look up a user by email (login).
CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email text)
  RETURNS SETOF app_user
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT * FROM app_user WHERE email = p_email LIMIT 1;
$$;

-- Look up a user by id (refresh).
CREATE OR REPLACE FUNCTION auth_find_user_by_id(p_id uuid)
  RETURNS SETOF app_user
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT * FROM app_user WHERE id = p_id LIMIT 1;
$$;

-- Set/clear the rotating refresh-token hash for a user.
CREATE OR REPLACE FUNCTION auth_set_refresh_hash(p_id uuid, p_hash text)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE app_user SET refresh_token_hash = p_hash, updated_at = now() WHERE id = p_id;
$$;

-- Allow the restricted app role to call these (and only these) auth helpers.
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO drilliq_app;
GRANT EXECUTE ON FUNCTION auth_find_user_by_id(uuid) TO drilliq_app;
GRANT EXECUTE ON FUNCTION auth_set_refresh_hash(uuid, text) TO drilliq_app;
