-- Create draft audit log table for tracking errors and commissioner actions
CREATE TABLE IF NOT EXISTS draft_audit_log (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,
  roster_id INTEGER REFERENCES rosters(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_audit_log_draft ON draft_audit_log(draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_audit_log_event ON draft_audit_log(event_type, created_at DESC);

COMMENT ON TABLE draft_audit_log IS 'Audit trail for draft events, errors, and commissioner actions';
COMMENT ON COLUMN draft_audit_log.event_type IS 'Type of event: auto_pick_failed, commissioner_undo, commissioner_force_pick, etc.';
