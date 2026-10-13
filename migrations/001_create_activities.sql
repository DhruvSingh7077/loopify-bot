CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task', 'meeting', 'call', 'follow-up')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  scheduled_for TIMESTAMPTZ,
  contact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS activities_owner_schedule_idx
  ON activities (owner_id, scheduled_for);

CREATE INDEX IF NOT EXISTS activities_owner_status_idx
  ON activities (owner_id, status);
