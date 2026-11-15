ALTER TABLE service_offerings
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES service_offerings(id) ON DELETE CASCADE,
  provider_user_id uuid NOT NULL REFERENCES app_user_profiles(user_id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES app_user_profiles(user_id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('transporte', 'almacenamiento', 'maquinaria')),
  quantity numeric(14, 2) NOT NULL CHECK (quantity > 0),
  quantity_unit text NOT NULL CHECK (quantity_unit IN ('toneladas', 'hectareas')),
  needed_from date,
  needed_until date,
  request_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text CHECK (message IS NULL OR length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'quoted', 'accepted', 'declined', 'cancelled')),
  quote_price numeric(14, 2) CHECK (quote_price IS NULL OR quote_price > 0),
  quote_currency text CHECK (quote_currency IS NULL OR quote_currency IN ('ARS', 'USD')),
  quote_price_unit text CHECK (quote_price_unit IS NULL OR quote_price_unit IN (
    'por_viaje', 'por_km', 'por_dia', 'por_tonelada',
    'por_tonelada_mes', 'por_tonelada_dia', 'por_hectarea', 'por_hora'
  )),
  quote_message text CHECK (quote_message IS NULL OR length(quote_message) <= 1000),
  quote_valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_user_id <> requester_user_id),
  CHECK (needed_from IS NULL OR needed_until IS NULL OR needed_until >= needed_from),
  CHECK (
    status NOT IN ('quoted', 'accepted')
    OR (quote_price IS NOT NULL AND quote_currency IS NOT NULL AND quote_price_unit IS NOT NULL)
  ),
  FOREIGN KEY (field_id, requester_user_id)
    REFERENCES account_fields(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS service_requests_provider_status_created_idx
  ON service_requests (provider_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_requester_created_idx
  ON service_requests (requester_user_id, created_at DESC);
