-- Create private storage bucket for encoded/scrambled images.
-- Backend uploads with service-role key (bypasses RLS), so no public policy is needed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'protected-images',
  'protected-images',
  false,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
