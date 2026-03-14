-- Add encrypted_subkey column to images table
-- Each image gets its own subkey, encrypted with the owner's master key
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS encrypted_subkey TEXT;

-- Create private storage bucket for scrambled images
INSERT INTO storage.buckets (id, name, public)
VALUES ('protected-images', 'protected-images', false)
ON CONFLICT (id) DO NOTHING;
