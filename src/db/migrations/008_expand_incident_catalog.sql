-- Migration 008: Expand Incident Catalog
-- Adds more comprehensive issue categories and realistic incident types for national exams.

-- 1. Insert new categories
INSERT INTO issue_categories (name) VALUES 
    ('Infrastructure'),
    ('Facilities')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert new incident types and map them to their categories
-- We use a DO NOTHING conflict strategy since name is UNIQUE.

WITH cat AS (
    SELECT id, name FROM issue_categories
)
INSERT INTO incident_types (id, name, default_priority, category_id) VALUES
    -- System / Software
    (gen_random_uuid(), 'Application Freeze / Unresponsive', 'High', (SELECT id FROM cat WHERE name = 'System')),
    (gen_random_uuid(), 'Login Failure / Auth Error', 'High', (SELECT id FROM cat WHERE name = 'System')),
    (gen_random_uuid(), 'Missing Exam Content', 'Critical', (SELECT id FROM cat WHERE name = 'System')),
    (gen_random_uuid(), 'Biometric Verification Failure', 'Medium', (SELECT id FROM cat WHERE name = 'System')),
    
    -- Hardware
    (gen_random_uuid(), 'Tablet Screen Broken', 'Medium', (SELECT id FROM cat WHERE name = 'Hardware')),
    (gen_random_uuid(), 'Device Battery Depleted', 'High', (SELECT id FROM cat WHERE name = 'Hardware')),
    (gen_random_uuid(), 'Charger/Cable Malfunction', 'Low', (SELECT id FROM cat WHERE name = 'Hardware')),
    (gen_random_uuid(), 'Local Server Hardware Failure', 'Critical', (SELECT id FROM cat WHERE name = 'Hardware')),

    -- Network
    (gen_random_uuid(), 'Slow Internet / High Latency', 'Medium', (SELECT id FROM cat WHERE name = 'Network')),
    (gen_random_uuid(), 'Access Point / Router Offline', 'High', (SELECT id FROM cat WHERE name = 'Network')),
    (gen_random_uuid(), 'Local Server Sync Failure', 'High', (SELECT id FROM cat WHERE name = 'Network')),

    -- Security
    (gen_random_uuid(), 'Unauthorized Item (Phone/Watch)', 'High', (SELECT id FROM cat WHERE name = 'Security')),
    (gen_random_uuid(), 'Impersonation Attempt', 'Critical', (SELECT id FROM cat WHERE name = 'Security')),
    (gen_random_uuid(), 'Disruptive Behavior', 'Medium', (SELECT id FROM cat WHERE name = 'Security')),
    (gen_random_uuid(), 'Question Paper Leak Suspected', 'Critical', (SELECT id FROM cat WHERE name = 'Security')),

    -- Infrastructure / Facilities
    (gen_random_uuid(), 'Generator Failure', 'High', (SELECT id FROM cat WHERE name = 'Infrastructure')),
    (gen_random_uuid(), 'Poor Lighting / Ventilation', 'Low', (SELECT id FROM cat WHERE name = 'Facilities')),
    (gen_random_uuid(), 'Medical Emergency', 'Critical', (SELECT id FROM cat WHERE name = 'Facilities'))
ON CONFLICT (name) DO NOTHING;

-- 3. Update existing ones to ensure they have the correct category mapping
-- (from migration 002/003)
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'System') WHERE name = 'Exam-System Crash';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Infrastructure') WHERE name = 'Power Failure';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Network') WHERE name = 'Network Outage';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Security') WHERE name = 'Security Incident';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Facilities') WHERE name = 'Wellness Incident';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Security') WHERE name = 'Access Management Issue';
UPDATE incident_types SET category_id = (SELECT id FROM issue_categories WHERE name = 'Security') WHERE name = 'Students Access Management Issue';
