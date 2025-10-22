-- Add invite_code column to leagues table
ALTER TABLE
    leagues
ADD
    COLUMN IF NOT EXISTS invite_code VARCHAR(10) UNIQUE;

-- Generate random invite codes for existing leagues
UPDATE
    leagues
SET
    invite_code = upper(
        substring(
            md5(random() :: text || id :: text)
            from
                1 for 6
        )
    )
WHERE
    invite_code IS NULL;

-- Create index on invite_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);