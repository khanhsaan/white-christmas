create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table public.images enable row level security;
