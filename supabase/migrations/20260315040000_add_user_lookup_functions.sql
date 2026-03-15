-- User lookup helpers that run as the DB owner (security definer) so the
-- backend can call them via RPC without needing the auth admin JWT.

create or replace function get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

create or replace function get_user_email_by_id(p_user_id uuid)
returns text
language sql
security definer
stable
as $$
  select email from auth.users
  where id = p_user_id
  limit 1;
$$;
