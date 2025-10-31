-- Add is_admin column to users table for system-wide admin privileges
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- Add comment explaining the field
COMMENT ON COLUMN users.is_admin IS 'System-wide admin privilege for managing global operations like data sync and recalculations';
