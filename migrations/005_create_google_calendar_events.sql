CREATE TABLE IF NOT EXISTS google_calendar_events (
  owner_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  html_link TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (owner_id, google_event_id)
);
