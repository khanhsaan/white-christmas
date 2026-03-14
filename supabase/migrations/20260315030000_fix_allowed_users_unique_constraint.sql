-- Fix: replace partial unique index with a proper unique constraint so that
-- upsert ON CONFLICT (owner_id, viewer_id) works correctly.

-- Drop the partial index that was blocking the ON CONFLICT clause.
drop index if exists public.allowed_users_owner_viewer_unique_idx;

-- Add the proper unique constraint (works with upsert ON CONFLICT).
alter table public.allowed_users
  add constraint allowed_users_owner_viewer_unique unique (owner_id, viewer_id);
