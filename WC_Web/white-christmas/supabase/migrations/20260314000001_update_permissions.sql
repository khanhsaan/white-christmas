-- Drop old image-level permissions table
DROP TABLE IF EXISTS public.permissions;

-- New user-level permissions table
-- owner grants viewer access to ALL their images in one go
CREATE TABLE IF NOT EXISTS public.permissions (
    owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    viewer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (owner_id, viewer_id)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Owner can grant access
CREATE POLICY "owner can grant permission"
    ON public.permissions FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Viewer can see who gave them access
CREATE POLICY "viewer can see own permissions"
    ON public.permissions FOR SELECT
    USING (auth.uid() = viewer_id OR auth.uid() = owner_id);
