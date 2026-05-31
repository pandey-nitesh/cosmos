-- Seed data. Demo dates use SQLite date modifiers (date('now', ...)) so the
-- story (compliant / expiring-soon / lapsed) holds no matter when you run it.
--
-- ⚠️  Jurisdiction rules below are realistic but ILLUSTRATIVE and simplified for a
--     reference build. Each row carries source_url + verified_on; always confirm
--     with the city before relying on them. (Front Range licensing is genuinely
--     fragmented — that is the whole point of the product.)

-- ---------- Jurisdictions ----------
INSERT INTO jurisdictions (id, name, state, license_authority, has_local_license, renewal_period_months, grace_period_days, source_url, verified_on, notes) VALUES
 ('co-state',   'Colorado (state baseline)', 'CO', 'CO DORA',                 0, 36, 0,  'https://dpo.colorado.gov/Electrical',                 '2026-05-01', 'No statewide GENERAL contractor license. Electrical & plumbing are state-licensed via DORA; municipalities add local registration.'),
 ('denver',     'Denver',                    'CO', 'Denver Community Planning & Development', 1, 24, 0,  'https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/Licensing', '2026-05-01', 'Contractor & trade licenses issued locally; separate registration required.'),
 ('aurora',     'Aurora',                    'CO', 'Aurora Building Division', 1, 24, 0,  'https://www.auroragov.org/business_services/contractor_licensing', '2026-05-01', 'Separate Aurora contractor license/registration; no reciprocity with Denver.'),
 ('lakewood',   'Lakewood',                  'CO', 'Lakewood Permits',         1, 12, 0,  'https://www.lakewood.org/Government/Departments/Planning/Permits-and-Licensing', '2026-05-01', 'Annual contractor license renewal.'),
 ('boulder',    'Boulder',                   'CO', 'Boulder Planning & Development', 1, 12, 30, 'https://bouldercolorado.gov/services/contractor-licensing', '2026-05-01', '30-day grace window on renewal.'),
 ('cosprings',  'Colorado Springs',          'CO', 'Pikes Peak Regional Building Dept', 1, 24, 0, 'https://www.pprbd.org/', '2026-05-01', 'Regional building dept administers contractor licensing.'),
 ('wheatridge', 'Wheat Ridge',               'CO', 'Wheat Ridge Building Division', 1, 24, 0, 'https://www.ci.wheatridge.co.us/161/Building-Division', '2026-05-01', 'Accepts certain neighboring-jurisdiction general licenses (see reciprocity).');

-- ---------- Requirements (to bid TRADE in JURISDICTION) ----------
-- general
INSERT INTO jurisdiction_requirements (id, jurisdiction_id, trade, required_classes, min_per_occurrence, min_aggregate, workers_comp_required, additional_insured_required, notes) VALUES
 ('req-den-gen',  'denver',     'general',    '["A","B","C"]', 1000000, 2000000, 1, 1, 'Class A/B/C by project scope.'),
 ('req-aur-gen',  'aurora',     'general',    '["A","B","C"]', 1000000, 2000000, 1, 1, NULL),
 ('req-lak-gen',  'lakewood',   'general',    '["A","B"]',     1000000, 2000000, 1, 0, NULL),
 ('req-wr-gen',   'wheatridge', 'general',    '["A","B"]',     1000000, 2000000, 1, 0, NULL),
 ('req-cos-gen',  'cosprings',  'general',    '["A","B","C"]', 1000000, 2000000, 1, 0, NULL),
 ('req-bou-gen',  'boulder',    'general',    '["A","B"]',     1000000, 2000000, 1, 1, NULL);
-- electrical
INSERT INTO jurisdiction_requirements (id, jurisdiction_id, trade, required_classes, min_per_occurrence, min_aggregate, workers_comp_required, additional_insured_required, notes) VALUES
 ('req-den-elec', 'denver',     'electrical', '["Master"]', 1000000, 2000000, 1, 1, 'State master electrician + Denver registration.'),
 ('req-aur-elec', 'aurora',     'electrical', '["Master"]', 1000000, 2000000, 1, 1, 'Separate Aurora electrical registration required.'),
 ('req-bou-elec', 'boulder',    'electrical', '["Master"]', 1000000, 2000000, 1, 0, NULL),
 ('req-cos-elec', 'cosprings',  'electrical', '["Master"]', 1000000, 2000000, 1, 0, NULL);
-- hvac (any active local registration; class-agnostic)
INSERT INTO jurisdiction_requirements (id, jurisdiction_id, trade, required_classes, min_per_occurrence, min_aggregate, workers_comp_required, additional_insured_required, notes) VALUES
 ('req-den-hvac', 'denver',     'hvac', '[]', 1000000, 2000000, 1, 1, 'Mechanical contractor registration.'),
 ('req-aur-hvac', 'aurora',     'hvac', '[]', 1000000, 2000000, 1, 0, NULL);
-- roofing
INSERT INTO jurisdiction_requirements (id, jurisdiction_id, trade, required_classes, min_per_occurrence, min_aggregate, workers_comp_required, additional_insured_required, notes) VALUES
 ('req-lak-roof', 'lakewood',   'roofing', '[]', 1000000, 2000000, 1, 0, NULL),
 ('req-den-roof', 'denver',     'roofing', '[]', 1000000, 2000000, 1, 1, NULL),
 ('req-aur-roof', 'aurora',     'roofing', '[]', 1000000, 2000000, 1, 0, NULL);

-- ---------- Reciprocity (NICE-TO-HAVE #11) ----------
-- Wheat Ridge accepts a Denver general license (Class A/B) as a path to bid.
INSERT INTO jurisdiction_reciprocity (id, jurisdiction_id, accepts_from, accepts_classes, notes) VALUES
 ('rec-wr-den', 'wheatridge', 'denver', '["A","B"]', 'Wheat Ridge recognizes Denver general Class A/B for local registration.');

-- ============================================================
-- DEMO BUSINESSES — each illustrates a different compliance state.
-- ============================================================

-- (1) Summit Electric LLC — COMPLIANT in Denver, BLOCKED in Aurora (no Aurora registration).
INSERT INTO businesses (id, name, trade, primary_email, primary_phone, home_city) VALUES
 ('biz-summit', 'Summit Electric LLC', 'electrical', 'ops@summitelectric.example', '+1-303-555-0101', 'Denver');
INSERT INTO people (id, business_id, full_name, email, role) VALUES
 ('p-dana', 'biz-summit', 'Dana Ruiz', 'dana@summitelectric.example', 'Master Electrician (Qualifier)');
INSERT INTO licenses (id, business_id, person_id, jurisdiction_id, trade, classification, license_number, issued_on, expires_on, status) VALUES
 ('lic-summit-den', 'biz-summit', 'p-dana', 'denver', 'electrical', 'Master', 'DEN-EC-44821', date('now','-400 days'), date('now','+300 days'), 'active');
INSERT INTO insurance_policies (id, business_id, coverage_type, carrier, policy_number, per_occurrence_limit, aggregate_limit, additional_insured, waiver_of_subrogation, expires_on) VALUES
 ('ins-summit-gl', 'biz-summit', 'general_liability', 'Pinnacle Mutual', 'GL-99312', 1000000, 2000000, 1, 1, date('now','+150 days')),
 ('ins-summit-wc', 'biz-summit', 'workers_comp',      'Pinnacle Mutual', 'WC-99313', 1000000, 1000000, 0, 0, date('now','+180 days'));

-- (2) Front Range Mechanical — license fine, but GENERAL-LIABILITY COI lapses in ~12 days (YELLOW).
INSERT INTO businesses (id, name, trade, primary_email, primary_phone, home_city) VALUES
 ('biz-frm', 'Front Range Mechanical', 'hvac', 'admin@frmech.example', '+1-720-555-0144', 'Denver');
INSERT INTO people (id, business_id, full_name, email, role) VALUES
 ('p-marco', 'biz-frm', 'Marco Lindqvist', 'marco@frmech.example', 'Mechanical Contractor (Qualifier)');
INSERT INTO licenses (id, business_id, person_id, jurisdiction_id, trade, classification, license_number, issued_on, expires_on, status) VALUES
 ('lic-frm-den', 'biz-frm', 'p-marco', 'denver', 'hvac', 'Mechanical', 'DEN-MC-20155', date('now','-300 days'), date('now','+70 days'), 'active');
INSERT INTO insurance_policies (id, business_id, coverage_type, carrier, policy_number, per_occurrence_limit, aggregate_limit, additional_insured, waiver_of_subrogation, expires_on) VALUES
 ('ins-frm-gl', 'biz-frm', 'general_liability', 'Front Range Casualty', 'GL-55021', 1000000, 2000000, 1, 0, date('now','+12 days')),
 ('ins-frm-wc', 'biz-frm', 'workers_comp',      'Front Range Casualty', 'WC-55022', 1000000, 1000000, 0, 0, date('now','+200 days'));

-- (3) Bluebird Roofing Co — Lakewood roofing license ALREADY LAPSED (RED / overdue).
INSERT INTO businesses (id, name, trade, primary_email, primary_phone, home_city) VALUES
 ('biz-bluebird', 'Bluebird Roofing Co', 'roofing', 'office@bluebirdroof.example', '+1-303-555-0188', 'Lakewood');
INSERT INTO people (id, business_id, full_name, email, role) VALUES
 ('p-priya', 'biz-bluebird', 'Priya Anand', 'priya@bluebirdroof.example', 'Owner / Qualifier');
INSERT INTO licenses (id, business_id, person_id, jurisdiction_id, trade, classification, license_number, issued_on, expires_on, status) VALUES
 ('lic-bb-lak', 'biz-bluebird', 'p-priya', 'lakewood', 'roofing', NULL, 'LAK-RF-7741', date('now','-376 days'), date('now','-11 days'), 'active');
INSERT INTO insurance_policies (id, business_id, coverage_type, carrier, policy_number, per_occurrence_limit, aggregate_limit, additional_insured, waiver_of_subrogation, expires_on) VALUES
 ('ins-bb-gl', 'biz-bluebird', 'general_liability', 'Summit Surety', 'GL-31002', 1000000, 2000000, 0, 0, date('now','+90 days')),
 ('ins-bb-wc', 'biz-bluebird', 'workers_comp',      'Summit Surety', 'WC-31003', 1000000, 1000000, 0, 0, date('now','+90 days'));

-- (4) Cornerstone Builders — bids Wheat Ridge via RECIPROCITY on its Denver general license.
INSERT INTO businesses (id, name, trade, primary_email, primary_phone, home_city) VALUES
 ('biz-corner', 'Cornerstone Builders', 'general', 'bids@cornerstone.example', '+1-303-555-0170', 'Denver');
INSERT INTO people (id, business_id, full_name, email, role) VALUES
 ('p-sam', 'biz-corner', 'Sam Okafor', 'sam@cornerstone.example', 'General Contractor (Qualifier)');
INSERT INTO licenses (id, business_id, person_id, jurisdiction_id, trade, classification, license_number, issued_on, expires_on, status) VALUES
 ('lic-corner-den', 'biz-corner', 'p-sam', 'denver', 'general', 'B', 'DEN-GC-10233', date('now','-200 days'), date('now','+250 days'), 'active');
INSERT INTO insurance_policies (id, business_id, coverage_type, carrier, policy_number, per_occurrence_limit, aggregate_limit, additional_insured, waiver_of_subrogation, expires_on) VALUES
 ('ins-corner-gl', 'biz-corner', 'general_liability', 'Centennial Indemnity', 'GL-77410', 1000000, 2000000, 1, 1, date('now','+160 days')),
 ('ins-corner-wc', 'biz-corner', 'workers_comp',      'Centennial Indemnity', 'WC-77411', 1000000, 1000000, 0, 0, date('now','+160 days'));
