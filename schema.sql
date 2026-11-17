-- Que Sera Sera Restaurant & Bar — Cloudflare D1 schema
-- Apply with: wrangler d1 execute que-sera-sera --file=./schema.sql [--local]
--
-- Upgrading an existing table? Run these once, then apply the indexes below:
--   ALTER TABLE reservations ADD COLUMN reference TEXT;
--   ALTER TABLE reservations ADD COLUMN consent_at TEXT;
--   UPDATE reservations SET reference = 'QSS-' || upper(substr(hex(idempotency_key), 1, 6));
--
-- `reference` is the guest-facing code (QSS-XXXXXX). It is generated from the
-- idempotency key, so retries always land on the same code and the self-service
-- cancel flow can find the booking without exposing internal ids.

CREATE TABLE IF NOT EXISTS reservations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reference        TEXT,
  guest_name       TEXT    NOT NULL,
  phone            TEXT    NOT NULL,
  reservation_date TEXT    NOT NULL,             -- ISO date, YYYY-MM-DD
  time_slot        TEXT    NOT NULL,             -- "7:00 pm"
  party_size       INTEGER NOT NULL CHECK (party_size > 0 AND party_size <= 20),
  special_requests TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  idempotency_key  TEXT    NOT NULL UNIQUE,
  status           TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'seated', 'cancelled', 'no_show')),
  consent_at       TEXT,                          -- DPDP Act 2023 consent timestamp
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Service-day lookups: "how full is 7pm on Friday?"
CREATE INDEX IF NOT EXISTS idx_reservations_date_slot
  ON reservations (reservation_date, time_slot);

-- Recognising returning guests and tracing a booking by phone.
CREATE INDEX IF NOT EXISTS idx_reservations_phone
  ON reservations (phone);

-- Host dashboard: oldest pending requests first.
CREATE INDEX IF NOT EXISTS idx_reservations_status_created
  ON reservations (status, created_at);

-- Self-service lookup: guest enters reference + phone to cancel. Not UNIQUE:
-- a six-character code is a human handle, and the phone check disambiguates.
CREATE INDEX IF NOT EXISTS idx_reservations_reference
  ON reservations (reference);
