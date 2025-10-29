-- Add trade notification settings to leagues table
-- Values: 'always_off', 'always_on', 'proposer_choice'
ALTER TABLE leagues
ADD COLUMN trade_notification_setting VARCHAR(20) DEFAULT 'proposer_choice',
ADD COLUMN trade_details_setting VARCHAR(20) DEFAULT 'proposer_choice';

-- Add check constraints
ALTER TABLE leagues
ADD CONSTRAINT trade_notification_setting_check
CHECK (trade_notification_setting IN ('always_off', 'always_on', 'proposer_choice'));

ALTER TABLE leagues
ADD CONSTRAINT trade_details_setting_check
CHECK (trade_details_setting IN ('always_off', 'always_on', 'proposer_choice'));
