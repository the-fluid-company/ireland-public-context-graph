CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  domains_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license TEXT NOT NULL,
  update_cadence TEXT NOT NULL,
  geography TEXT NOT NULL,
  temporal_coverage TEXT NOT NULL,
  formats_json TEXT NOT NULL,
  description TEXT NOT NULL,
  provenance_notes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  dataset_ids_json TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  dataset_ids_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence TEXT,
  valid_from TEXT,
  valid_to TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_relationships_subject ON relationships(subject);
CREATE INDEX IF NOT EXISTS idx_relationships_object ON relationships(object);
CREATE INDEX IF NOT EXISTS idx_relationships_predicate ON relationships(predicate);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value_json TEXT NOT NULL,
  unit TEXT,
  time_start TEXT,
  time_end TEXT,
  dataset_id TEXT NOT NULL,
  source_record_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
CREATE TABLE IF NOT EXISTS release_manifest (
  version TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);
