-- Frontline schema (D1 / SQLite)
-- Jurisdiction-agnostic by design so the same engine generalizes to any
-- home-rule / municipal-licensing market beyond the Colorado Front Range.

-- A municipality (or the state baseline) and the rules it imposes.
CREATE TABLE jurisdictions (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  state                 TEXT NOT NULL,
  license_authority     TEXT,              -- who issues/administers the license
  has_local_license     INTEGER NOT NULL DEFAULT 1,  -- 0 = relies on state/other
  renewal_period_months INTEGER,
  grace_period_days     INTEGER NOT NULL DEFAULT 0,   -- operate-during-renewal window
  -- Trust fields (PM round 1, MUST-FIX #7): rules are only as good as their provenance.
  source_url            TEXT,
  verified_on           TEXT,              -- ISO date the rule was last confirmed
  notes                 TEXT
);

-- "To bid TRADE in JURISDICTION you need a license class in required_classes
--  and insurance at/above these limits." (PM round 1, MUST-FIX #6 + #5)
CREATE TABLE jurisdiction_requirements (
  id                       TEXT PRIMARY KEY,
  jurisdiction_id          TEXT NOT NULL REFERENCES jurisdictions(id),
  trade                    TEXT NOT NULL,  -- general | electrical | plumbing | hvac | roofing ...
  required_classes         TEXT NOT NULL DEFAULT '[]', -- JSON array, e.g. ["A","B"]
  min_per_occurrence       INTEGER NOT NULL DEFAULT 0, -- general-liability per-occurrence (USD)
  min_aggregate            INTEGER NOT NULL DEFAULT 0, -- general-liability aggregate (USD)
  workers_comp_required    INTEGER NOT NULL DEFAULT 0,
  additional_insured_required INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  UNIQUE (jurisdiction_id, trade)
);

-- Reciprocity / acceptance (PM round 1, NICE-TO-HAVE #11): jurisdiction A accepts
-- a license issued by jurisdiction B (optionally only certain classes).
CREATE TABLE jurisdiction_reciprocity (
  id                  TEXT PRIMARY KEY,
  jurisdiction_id     TEXT NOT NULL REFERENCES jurisdictions(id),  -- the accepting city
  accepts_from        TEXT NOT NULL REFERENCES jurisdictions(id),  -- the issuing city
  accepts_classes     TEXT NOT NULL DEFAULT '[]',  -- JSON array; [] = any class
  notes               TEXT
);

-- The contracting business (bids the work).
CREATE TABLE businesses (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  trade          TEXT NOT NULL,
  primary_email  TEXT,
  primary_phone  TEXT,
  home_city      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The qualified individuals (qualifiers) who actually hold licenses for a business.
-- (PM round 1, MUST-FIX #3 — the #1 data gap.)
CREATE TABLE people (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  full_name    TEXT NOT NULL,
  email        TEXT,
  role         TEXT             -- e.g. "Master Electrician (Qualifier)"
);

-- A license is held by a PERSON, credited to a BUSINESS, valid in a JURISDICTION.
CREATE TABLE licenses (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  person_id       TEXT REFERENCES people(id),
  jurisdiction_id TEXT NOT NULL REFERENCES jurisdictions(id),
  trade           TEXT NOT NULL,
  classification  TEXT,          -- the class held, e.g. "A"
  license_number  TEXT,
  issued_on       TEXT,
  expires_on      TEXT,          -- ISO date
  status          TEXT NOT NULL DEFAULT 'active',  -- active | suspended | revoked
  r2_key          TEXT,          -- document linkage (PM MUST-FIX #4)
  uploaded_at     TEXT
);

-- Insurance, with the granularity bid requirements actually check (PM MUST-FIX #5).
CREATE TABLE insurance_policies (
  id                  TEXT PRIMARY KEY,
  business_id         TEXT NOT NULL REFERENCES businesses(id),
  coverage_type       TEXT NOT NULL,   -- general_liability | workers_comp
  carrier             TEXT,
  policy_number       TEXT,
  per_occurrence_limit INTEGER NOT NULL DEFAULT 0,
  aggregate_limit      INTEGER NOT NULL DEFAULT 0,
  additional_insured   INTEGER NOT NULL DEFAULT 0,
  waiver_of_subrogation INTEGER NOT NULL DEFAULT 0,
  expires_on          TEXT,
  r2_key              TEXT,
  uploaded_at         TEXT
);

-- Permits are stubbed for the MVP (table only; PM NICE-TO-HAVE #14).
CREATE TABLE permits (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  jurisdiction_id TEXT REFERENCES jurisdictions(id),
  permit_number   TEXT,
  type            TEXT,
  status          TEXT,
  expires_on      TEXT
);

-- Alerts emitted by the deadline scan and processed by the queue consumer.
CREATE TABLE alerts (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  entity_type  TEXT NOT NULL,   -- license | insurance
  entity_id    TEXT NOT NULL,
  due_on       TEXT NOT NULL,
  severity     TEXT NOT NULL,   -- overdue | critical | warning
  channel      TEXT NOT NULL DEFAULT 'email',
  message      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);

CREATE INDEX idx_licenses_business ON licenses(business_id);
CREATE INDEX idx_licenses_expires ON licenses(expires_on);
CREATE INDEX idx_insurance_business ON insurance_policies(business_id);
CREATE INDEX idx_insurance_expires ON insurance_policies(expires_on);
CREATE INDEX idx_reqs_jurisdiction ON jurisdiction_requirements(jurisdiction_id);
CREATE INDEX idx_alerts_business ON alerts(business_id);
