create policy "Users only can read their own profile"
on public.profiles
for select
using (
  auth.uid() = user_id
);

create policy "Users can only update their own profile"
on public.profiles
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);