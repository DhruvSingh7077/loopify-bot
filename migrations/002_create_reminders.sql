CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS reminders_due_idx
  ON reminders (owner_id, status, remind_at);
