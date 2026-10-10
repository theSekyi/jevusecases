CREATE TABLE visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id <= 9007199254740991),
  country TEXT, path TEXT NOT NULL, created_at INTEGER NOT NULL,
  visitor_hash TEXT, ref TEXT, referrer_host TEXT
);
CREATE INDEX visitor_events_created_at_idx ON visitor_events(created_at DESC);
CREATE INDEX visitor_events_visitor_time_idx ON visitor_events(visitor_hash,created_at DESC);
CREATE INDEX visitor_events_country_time_idx ON visitor_events(country,created_at DESC) WHERE visitor_hash IS NULL;
CREATE INDEX visitor_events_source_time_idx ON visitor_events(referrer_host,created_at);
CREATE TABLE link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id <= 9007199254740991),
  created_at INTEGER NOT NULL, visitor_hash TEXT, kind TEXT NOT NULL,
  project_id TEXT, host TEXT, path TEXT
);
CREATE INDEX link_clicks_created_at_idx ON link_clicks(created_at DESC);
CREATE INDEX link_clicks_visitor_kind_time_idx ON link_clicks(visitor_hash,kind,project_id,created_at DESC);
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id <= 9007199254740991),
  email TEXT NOT NULL UNIQUE CHECK(email = lower(email)), password_hash TEXT NOT NULL,
  using_temp_password INTEGER NOT NULL DEFAULT 0 CHECK(using_temp_password IN (0,1)),
  credential_version INTEGER NOT NULL DEFAULT 0 CHECK(credential_version BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL, access_enabled INTEGER NOT NULL DEFAULT 1 CHECK(access_enabled IN (0,1))
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_user_id_idx ON admin_sessions(user_id);
CREATE TABLE incremental_cache (
  cache_key TEXT PRIMARY KEY, value TEXT NOT NULL, modified_at INTEGER NOT NULL
);
