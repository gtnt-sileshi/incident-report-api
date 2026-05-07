-- Migration 003: Add Issue Categories and Update Incident Types
-- 1. Create issue_categories table
CREATE TABLE IF NOT EXISTS issue_categories (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 2. Insert default categories
INSERT INTO issue_categories (name) VALUES 
    ('System'),
    ('Hardware'),
    ('Network'),
    ('Security'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- 3. Add category_id to incident_types
-- First add it as nullable
ALTER TABLE incident_types ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES issue_categories(id);

-- 4. Update existing incident_types with a default category (Other)
UPDATE incident_types 
SET category_id = (SELECT id FROM issue_categories WHERE name = 'Other')
WHERE category_id IS NULL;

-- 5. Make category_id NOT NULL
-- (Optional: only if you want to strictly follow schema.ts)
-- ALTER TABLE incident_types ALTER COLUMN category_id SET NOT NULL;

-- 6. Update default_priority CHECK constraint to include 'Critical'
ALTER TABLE incident_types DROP CONSTRAINT IF EXISTS incident_types_default_priority_check;
ALTER TABLE incident_types ADD CONSTRAINT incident_types_default_priority_check 
    CHECK (default_priority IN ('Low', 'Medium', 'High', 'Critical'));

-- 7. Update priority CHECK constraint in incidents table too
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_priority_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_priority_check 
    CHECK (priority IN ('Low', 'Medium', 'High', 'Critical'));
