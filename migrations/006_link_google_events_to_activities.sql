ALTER TABLE google_calendar_events
  ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_events_activity_idx
  ON google_calendar_events (owner_id, activity_id)
  WHERE activity_id IS NOT NULL;
