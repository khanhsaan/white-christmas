-- Remove compatibility duplicate columns now that backend uses canonical fields.
-- Canonical:
--   images.owner_id, images.storage_path
--   allowed_users.owner_id

-- 1) Backfill canonical columns from legacy columns where needed.
update public.images
set owner_id = user_id
where owner_id is null and user_id is not null;

update public.images
set storage_path = image_url
where storage_path is null and image_url is not null;

update public.allowed_users
set owner_id = user_id
where owner_id is null and user_id is not null;

-- 2) Drop legacy RLS policies that reference user_id.
drop policy if exists "Users can update their own images" on public.images;
drop policy if exists "Users can insert their own images" on public.images;
drop policy if exists "Users can delete their own images" on public.images;

drop policy if exists "Owners can read their allowed viewers" on public.allowed_users;
drop policy if exists "Owners can update their allowed viewers" on public.allowed_users;
drop policy if exists "Owners can insert their allowed viewers" on public.allowed_users;
drop policy if exists "Owners can delete their allowed viewers" on public.allowed_users;

-- 3) Recreate owner_id-based policies.
create policy "Users can update their own images"
on public.images
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Users can insert their own images"
on public.images
for insert
with check (auth.uid() = owner_id);

create policy "Users can delete their own images"
on public.images
for delete
using (auth.uid() = owner_id);

create policy "Owners can read their allowed viewers"
on public.allowed_users
for select
using (auth.uid() = owner_id);

create policy "Owners can update their allowed viewers"
on public.allowed_users
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Owners can insert their allowed viewers"
on public.allowed_users
for insert
with check (auth.uid() = owner_id);

create policy "Owners can delete their allowed viewers"
on public.allowed_users
for delete
using (auth.uid() = owner_id);

-- 4) Enforce canonical ownership columns.
alter table public.images
  alter column owner_id set not null,
  alter column storage_path set not null;

alter table public.allowed_users
  alter column owner_id set not null;

-- 5) Remove duplicate compatibility columns.
alter table public.images
  drop column if exists user_id,
  drop column if exists image_url;

alter table public.allowed_users
  drop column if exists user_id;
