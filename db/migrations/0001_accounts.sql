CREATE TABLE IF NOT EXISTS app_user_profiles (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('productor', 'prestador')),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  phone text CHECK (phone IS NULL OR length(phone) <= 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user_profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  area_ha numeric(12, 2) NOT NULL CHECK (area_ha > 0),
  latitude numeric(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  boundary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS account_fields_user_id_idx ON account_fields (user_id);

CREATE TABLE IF NOT EXISTS service_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_user_profiles(user_id) ON DELETE CASCADE,
  service_type text NOT NULL CHECK (service_type IN ('transporte', 'almacenamiento', 'maquinaria')),
  subtype text NOT NULL CHECK (length(trim(subtype)) BETWEEN 1 AND 120),
  price numeric(14, 2) NOT NULL CHECK (price > 0),
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  price_unit text NOT NULL CHECK (price_unit IN (
    'por_viaje', 'por_km', 'por_dia', 'por_tonelada',
    'por_tonelada_mes', 'por_tonelada_dia', 'por_hectarea', 'por_hora'
  )),
  capacity numeric(14, 2) NOT NULL CHECK (capacity > 0),
  capacity_unit text NOT NULL CHECK (capacity_unit IN ('toneladas', 'hectareas_dia', 'hectareas', 'metros_cubicos')),
  base_latitude numeric(9, 6) NOT NULL CHECK (base_latitude BETWEEN -90 AND 90),
  base_longitude numeric(9, 6) NOT NULL CHECK (base_longitude BETWEEN -180 AND 180),
  service_radius_km numeric(10, 2) NOT NULL CHECK (service_radius_km > 0),
  available_from date,
  available_until date,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_from IS NULL OR available_until IS NULL OR available_until >= available_from)
);
