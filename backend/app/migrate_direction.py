"""
Migration: Add IN/OUT direction columns.
Usage:  python -m app.migrate_direction
"""
from sqlalchemy import text
from app.db import engine

STATEMENTS = [
    "ALTER TABLE camera_devices ADD COLUMN IF NOT EXISTS direction VARCHAR DEFAULT 'both'",
    "ALTER TABLE face_events    ADD COLUMN IF NOT EXISTS direction VARCHAR",
    "CREATE INDEX IF NOT EXISTS idx_face_events_direction ON face_events (direction)",
    "CREATE INDEX IF NOT EXISTS idx_face_events_person_created ON face_events (person_id, created_at)",
]

with engine.begin() as conn:
    for statement in STATEMENTS:
        conn.execute(text(statement))

print("IN/OUT direction migration completed successfully.")
