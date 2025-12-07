-- Add auto_chips column to store AI-extracted chips
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS auto_chips JSONB DEFAULT '{}'::jsonb;

-- Update existing documents to copy current chips to auto_chips
UPDATE documents 
SET auto_chips = COALESCE(custom_chips, '{}'::jsonb)
WHERE auto_chips IS NULL OR auto_chips = '{}'::jsonb;