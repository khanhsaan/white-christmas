create policy "Owners can read their allowed viewers"
on public.allowed_users
for select
using (
  auth.uid() = user_id
);

create policy "Owners can update their allowed viewers"
on public.allowed_users
for update
using (
  auth.uid() = user_id
)
with check (
    auth.uid() = user_id
);

create policy "Owners can insert their allowed viewers"
on public.allowed_users
for insert
with check (
    auth.uid() = user_id
);

create policy "Owners can delete their allowed viewers"
on public.allowed_users
for delete
using (
  auth.uid() = user_id
)

