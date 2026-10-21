"""
Run once after adding AuditLog model.
Usage:  python -m app.migrate_audit_logs
"""
from sqlalchemy import text
from app.db import engine

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER,
        username    VARCHAR,
        action      VARCHAR NOT NULL,
        target_type VARCHAR,
        target_id   VARCHAR,
        details     TEXT,
        ip_address  VARCHAR,
        created_at  TIMESTAMP DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_logs (action)",
    "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_logs (user_id)",
]

with engine.begin() as conn:
    for s in STATEMENTS:
        conn.execute(text(s))

print("Audit logs migration completed successfully.")
