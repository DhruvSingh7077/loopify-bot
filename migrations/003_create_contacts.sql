CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  company TEXT,
  mobile TEXT,
  email TEXT,
  relationship TEXT NOT NULL DEFAULT 'other'
    CHECK (relationship IN ('customer', 'vendor', 'lead', 'partner', 'employee', 'other')),
  notes TEXT,
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS contacts_owner_name_idx ON contacts (owner_id, name);
