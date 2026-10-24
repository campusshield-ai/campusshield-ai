-- Restore the public Nigerian university directory used for institution search.
CREATE TABLE IF NOT EXISTS public.campus_universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ownership text NOT NULL CHECK (ownership IN ('Federal','State','Private')),
  state text NOT NULL CHECK (char_length(btrim(state)) BETWEEN 2 AND 80),
  source_url text NOT NULL DEFAULT 'https://enuc.nuc.edu.ng/nus',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  official_website text
);

ALTER TABLE public.campus_universities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campus_universities_read_active ON public.campus_universities;
CREATE POLICY campus_universities_read_active
  ON public.campus_universities FOR SELECT TO anon, authenticated
  USING (is_active = true);

GRANT SELECT ON public.campus_universities TO anon, authenticated;

CREATE INDEX IF NOT EXISTS campus_universities_active_name_idx
  ON public.campus_universities (name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS campus_universities_active_state_idx
  ON public.campus_universities (state) WHERE is_active = true;
