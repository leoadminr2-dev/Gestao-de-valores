-- REVIEW ONLY: apply through a reviewed Neon database migration after authorization.
-- Source of truth: Neon Postgres. Do not open public registration until Wix CMS historical
-- numbers have been imported and deduplicated, and production environment is ready.
CREATE TABLE IF NOT EXISTS public.refrigeracao_draw_campaigns (
  id text PRIMARY KEY,
  total_numbers integer NOT NULL CHECK (total_numbers BETWEEN 1 AND 999999),
  registration_open boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.refrigeracao_draw_entries (
  id uuid PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES public.refrigeracao_draw_campaigns(id),
  request_id uuid NOT NULL,
  participant_name text NOT NULL CHECK (length(participant_name) BETWEEN 5 AND 120),
  phone_e164 varchar(16) NOT NULL,
  requested_quantity integer NOT NULL CHECK (requested_quantity BETWEEN 1 AND 999999),
  assigned_numbers integer[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draw_entries_quantity_matches CHECK (cardinality(assigned_numbers)=requested_quantity),
  CONSTRAINT draw_entries_unique_phone UNIQUE (campaign_id,phone_e164),
  CONSTRAINT draw_entries_unique_request UNIQUE (campaign_id,request_id)
);
CREATE TABLE IF NOT EXISTS public.refrigeracao_draw_allocations (
  campaign_id text NOT NULL REFERENCES public.refrigeracao_draw_campaigns(id),
  number integer NOT NULL CHECK (number BETWEEN 1 AND 999999),
  entry_id uuid NOT NULL REFERENCES public.refrigeracao_draw_entries(id) ON DELETE RESTRICT,
  CONSTRAINT draw_allocations_unique_number PRIMARY KEY (campaign_id,number)
);
CREATE INDEX IF NOT EXISTS draw_allocations_entry_idx ON public.refrigeracao_draw_allocations (entry_id);
INSERT INTO public.refrigeracao_draw_campaigns (id,total_numbers,registration_open)
VALUES ('split-inverter-9000-2026',500,false)
ON CONFLICT (id) DO NOTHING;
