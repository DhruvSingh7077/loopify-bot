CREATE TABLE IF NOT EXISTS google_calendar_connections (
  owner_id TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

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
