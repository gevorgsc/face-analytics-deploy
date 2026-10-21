from sqlalchemy import text
from app.db import engine

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username VARCHAR,
        action VARCHAR NOT NULL,
        target_type VARCHAR,
        target_id VARCHAR,
        details TEXT,
        ip_address VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action)",
]

with engine.begin() as conn:
    for statement in STATEMENTS:
        conn.execute(text(statement))

print("Audit logs migration completed successfully.")
