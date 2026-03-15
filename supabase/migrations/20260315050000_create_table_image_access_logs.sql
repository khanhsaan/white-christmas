create table if not exists public.image_access_logs (
  id          bigserial primary key,
  image_id    bigint      not null,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  viewer_id   uuid        not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index if not exists image_access_logs_owner_idx
  on public.image_access_logs (owner_id, accessed_at desc);

alter table public.image_access_logs enable row level security;

create policy "owner can read own access logs"
  on public.image_access_logs for select
  using (owner_id = auth.uid());
