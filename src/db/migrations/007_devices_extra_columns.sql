-- Migration 007: Add missing columns to devices table
-- These columns exist in the Drizzle schema but were never added to the database.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS model           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS os_version      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS app_version     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS installation_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS public_key      TEXT;
