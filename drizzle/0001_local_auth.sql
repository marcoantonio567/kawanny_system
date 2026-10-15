CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE INDEX sessions_expires_idx ON sessions(expires);
