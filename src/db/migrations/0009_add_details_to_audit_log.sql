-- Add details field to audit_log table
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details TEXT;

-- Create tracking_number_sequences table if it doesn't exist
CREATE TABLE IF NOT EXISTS tracking_number_sequences (
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    last_seq INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (region_id, year)
);
