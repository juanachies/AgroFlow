ALTER TABLE account_fields
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE service_offerings
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS base_address text;
