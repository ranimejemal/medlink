
CREATE TABLE public.maintenance_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT maintenance_dates_valid
        CHECK (ends_at > starts_at)
);

CREATE INDEX maintenance_announcements_dates_idx
ON public.maintenance_announcements (starts_at, ends_at)
WHERE is_active = true;

ALTER TABLE public.maintenance_announcements
ENABLE ROW LEVEL SECURITY;


-- US-38 : Autorisations Supabase

GRANT SELECT ON public.maintenance_announcements
TO authenticated;

GRANT INSERT, UPDATE, DELETE
ON public.maintenance_announcements
TO authenticated;

-- Tous les utilisateurs connectés peuvent lire
-- les annonces actives.
-- Les administrateurs peuvent aussi consulter
-- les annonces désactivées.

CREATE POLICY "maintenance_read"
ON public.maintenance_announcements
FOR SELECT TO authenticated
USING (
    is_active = true
    OR public.is_admin()
);

-- Seuls les administrateurs avec MFA peuvent créer.

CREATE POLICY "maintenance_insert"
ON public.maintenance_announcements
FOR INSERT TO authenticated
WITH CHECK (
    public.is_admin()
    AND public.is_aal2()
);

-- Seuls les administrateurs avec MFA peuvent modifier.

CREATE POLICY "maintenance_update"
ON public.maintenance_announcements
FOR UPDATE TO authenticated
USING (
    public.is_admin()
    AND public.is_aal2()
)
WITH CHECK (
    public.is_admin()
    AND public.is_aal2()
);

-- Seuls les administrateurs avec MFA peuvent supprimer.

CREATE POLICY "maintenance_delete"
ON public.maintenance_announcements
FOR DELETE TO authenticated
USING (
    public.is_admin()
    AND public.is_aal2()
);
