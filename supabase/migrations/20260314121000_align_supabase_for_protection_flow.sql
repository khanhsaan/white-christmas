-- Supabase-first alignment for protection flow.
-- Keeps existing table names and adds canonical fields used by backend API.

-- 1) Dedicated crypto key storage (avoid overloading profiles table)
create table if not exists public.user_crypto_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fernet_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_crypto_keys enable row level security;

-- Service role is expected for backend access; users can read/update only their own row.
create policy "Users can read own crypto key row"
on public.user_crypto_keys
for select
using (auth.uid() = user_id);

create policy "Users can insert own crypto key row"
on public.user_crypto_keys
for insert
with check (auth.uid() = user_id);

create policy "Users can update own crypto key row"
on public.user_crypto_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2) Canonical image metadata on existing images table
alter table public.images
  add column if not exists image_id bigint,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists encrypted_subkey text,
  add column if not exists storage_path text,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill where reasonable for older rows.
update public.images
set owner_id = user_id
where owner_id is null and user_id is not null;

update public.images
set storage_path = image_url
where storage_path is null and image_url is not null;

-- image_id must be unique when present.
create unique index if not exists images_image_id_unique_idx
on public.images (image_id)
where image_id is not null;

create index if not exists images_owner_id_idx
on public.images (owner_id);

-- 3) Keep table name allowed_users and add owner_id alias for backend compatibility.
alter table public.allowed_users
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update public.allowed_users
set owner_id = user_id
where owner_id is null and user_id is not null;

create unique index if not exists allowed_users_owner_viewer_unique_idx
on public.allowed_users (owner_id, viewer_id)
where owner_id is not null;

create index if not exists allowed_users_owner_id_idx
on public.allowed_users (owner_id);
