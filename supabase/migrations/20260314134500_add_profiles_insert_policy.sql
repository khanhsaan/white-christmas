-- Fix RLS for client upsert on profiles.
-- Upsert requires INSERT policy even if conflict resolves to UPDATE.

create policy "Users can insert their own profile"
on public.profiles
for insert
with check (
  auth.uid() = user_id
);
