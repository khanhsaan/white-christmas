create policy "Images are publicly viewable"
on public.images
for select
using (true);

create policy "Users can update their own images"
on public.images
for update
using (
    auth.uid() = user_id
)
with check (
    auth.uid() = user_id
);

create policy "Users can insert their own images"
on public.images
for insert
with check (
    auth.uid() = user_id
);

create policy "Users can delete their own images"
on public.images
for delete
using (
    auth.uid() = user_id
);