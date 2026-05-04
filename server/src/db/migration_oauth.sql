-- Migration: add OAuth provider columns, make password_hash optional
-- Run once against existing databases. schema.sql already includes these for fresh installs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS provider    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_provider_id_unique
  ON users (provider, provider_id)
  WHERE provider IS NOT NULL AND provider_id IS NOT NULL;
