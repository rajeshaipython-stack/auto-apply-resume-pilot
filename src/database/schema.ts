/**
 * SQLite schema for ResumePilot local application tracking.
 *
 * The database stores structured job/application/tracking data only. The actual
 * resume files (master + per-application versions) live on the filesystem under
 * the data directory; the DB references them by path.
 *
 * Personal data lives strictly inside the user's local data directory and is
 * git-ignored. No third-party passwords, OTPs or tokens are ever stored here.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  id         TEXT PRIMARY KEY,           -- always 'master'
  json       TEXT NOT NULL,              -- serialized MasterProfile
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  fingerprint  TEXT NOT NULL,
  title        TEXT,
  company      TEXT,
  location     TEXT,
  source       TEXT,                     -- adapter id
  url          TEXT,
  json         TEXT NOT NULL,            -- serialized StructuredJob
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);

CREATE TABLE IF NOT EXISTS applications (
  id                TEXT PRIMARY KEY,
  number            INTEGER NOT NULL UNIQUE,
  slug              TEXT NOT NULL UNIQUE,
  job_id            TEXT NOT NULL,
  company           TEXT,
  role              TEXT,
  source_adapter    TEXT NOT NULL,
  job_url           TEXT,
  status            TEXT NOT NULL,
  original_ats      REAL,
  optimized_ats     REAL,
  match_score       REAL,
  resume_version    TEXT,
  resume_pdf_path   TEXT,
  resume_docx_path  TEXT,
  applied_at        TEXT,
  pending_actions   TEXT NOT NULL DEFAULT '[]',   -- json array
  email_updates     TEXT NOT NULL DEFAULT '[]',   -- json array of EmailUpdate
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);

CREATE TABLE IF NOT EXISTS status_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  TEXT NOT NULL,
  status          TEXT NOT NULL,
  at              TEXT NOT NULL,
  note            TEXT,
  source          TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hist_app ON status_history(application_id);
`;
