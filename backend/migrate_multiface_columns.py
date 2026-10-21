from sqlalchemy import text
from app.db import engine

STATEMENTS = [
    "ALTER TABLE persons ADD COLUMN IF NOT EXISTS is_unknown_group INTEGER DEFAULT 0",
    "ALTER TABLE persons ADD COLUMN IF NOT EXISTS unknown_label VARCHAR",
    "ALTER TABLE persons ADD COLUMN IF NOT EXISTS last_camera_name VARCHAR",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS face_index INTEGER",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS face_count INTEGER",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS face_quality DOUBLE PRECISION",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS quality_reason VARCHAR",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS det_score DOUBLE PRECISION",
    "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS matched_unknown_group INTEGER DEFAULT 0",
]

with engine.begin() as conn:
    for statement in STATEMENTS:
        conn.execute(text(statement))

print("Multi-face columns migration completed successfully.")
