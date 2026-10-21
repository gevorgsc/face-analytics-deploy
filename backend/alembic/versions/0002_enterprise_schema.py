"""Move enterprise/runtime schema changes into Alembic.

Revision ID: 0002_enterprise_schema
Revises: 0001_in_out_direction
Create Date: 2026-06-03
"""

from alembic import op


revision = "0002_enterprise_schema"
down_revision = "0001_in_out_direction"
branch_labels = None
depends_on = None


def _columns(bind, table_name: str) -> set[str]:
    dialect = bind.dialect.name
    if dialect == "sqlite":
        return {row[1] for row in bind.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()}
    rows = bind.exec_driver_sql(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = %(table_name)s
        """,
        {"table_name": table_name},
    ).fetchall()
    return {row[0] for row in rows}


def _add_column_if_missing(bind, table_name: str, column_name: str, ddl: str) -> None:
    if column_name not in _columns(bind, table_name):
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN {ddl}")


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        statements = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]'",
            "ALTER TABLE camera_devices ADD COLUMN IF NOT EXISTS snapshot_mode VARCHAR DEFAULT 'rtsp'",
            "ALTER TABLE camera_devices ADD COLUMN IF NOT EXISTS http_port INTEGER DEFAULT 80",
            "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS age INTEGER",
            "ALTER TABLE face_events ADD COLUMN IF NOT EXISTS gender VARCHAR",
            """CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                revoked INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash)",
            """CREATE TABLE IF NOT EXISTS alert_configs (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                is_active INTEGER DEFAULT 1,
                trigger_person_type VARCHAR DEFAULT 'blacklist',
                min_confidence FLOAT DEFAULT 0.0,
                channels TEXT DEFAULT '[]',
                cooldown_seconds INTEGER DEFAULT 300,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS alert_events (
                id SERIAL PRIMARY KEY,
                alert_config_id INTEGER NOT NULL REFERENCES alert_configs(id) ON DELETE CASCADE,
                face_event_id INTEGER REFERENCES face_events(id) ON DELETE SET NULL,
                person_id INTEGER,
                person_type VARCHAR,
                channel_type VARCHAR,
                status VARCHAR DEFAULT 'sent',
                error_message TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events (created_at)",
            """CREATE TABLE IF NOT EXISTS webhook_configs (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                url TEXT NOT NULL,
                secret VARCHAR,
                is_active INTEGER DEFAULT 1,
                event_types TEXT DEFAULT '["blacklist_detected"]',
                method VARCHAR DEFAULT 'POST',
                headers TEXT DEFAULT '{}',
                last_triggered_at TIMESTAMP,
                last_status_code INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS camera_zones (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                description TEXT,
                color VARCHAR DEFAULT '#3B82F6',
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS camera_zone_mappings (
                id SERIAL PRIMARY KEY,
                zone_id INTEGER NOT NULL REFERENCES camera_zones(id) ON DELETE CASCADE,
                camera_id INTEGER NOT NULL REFERENCES camera_devices(id) ON DELETE CASCADE
            )""",
            "CREATE INDEX IF NOT EXISTS idx_zone_mappings_zone ON camera_zone_mappings (zone_id)",
            "CREATE INDEX IF NOT EXISTS idx_zone_mappings_camera ON camera_zone_mappings (camera_id)",
            """CREATE TABLE IF NOT EXISTS scheduled_reports (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                report_type VARCHAR DEFAULT 'attendance',
                format VARCHAR DEFAULT 'excel',
                schedule_cron VARCHAR DEFAULT '0 8 * * 1',
                recipients TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                last_sent_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS ldap_configs (
                id SERIAL PRIMARY KEY,
                is_active INTEGER DEFAULT 0,
                server_url VARCHAR NOT NULL DEFAULT 'ldap://localhost:389',
                bind_dn VARCHAR,
                bind_password TEXT,
                base_dn VARCHAR NOT NULL DEFAULT 'dc=example,dc=com',
                user_search_filter VARCHAR DEFAULT '(sAMAccountName={username})',
                default_role VARCHAR DEFAULT 'viewer',
                admin_groups TEXT DEFAULT '[]',
                operator_groups TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS user_camera_permissions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                camera_id INTEGER NOT NULL REFERENCES camera_devices(id) ON DELETE CASCADE,
                can_view INTEGER DEFAULT 1,
                can_view_live INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_ucp_user ON user_camera_permissions (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_ucp_camera ON user_camera_permissions (camera_id)",
        ]
        for statement in statements:
            op.execute(statement)
        return

    if dialect == "sqlite":
        _add_column_if_missing(bind, "users", "permissions", "permissions TEXT DEFAULT '[]'")
        _add_column_if_missing(bind, "camera_devices", "snapshot_mode", "snapshot_mode VARCHAR DEFAULT 'rtsp'")
        _add_column_if_missing(bind, "camera_devices", "http_port", "http_port INTEGER DEFAULT 80")
        _add_column_if_missing(bind, "face_events", "age", "age INTEGER")
        _add_column_if_missing(bind, "face_events", "gender", "gender VARCHAR")
        statements = [
            """CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash VARCHAR NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                revoked INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )""",
            "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash)",
            """CREATE TABLE IF NOT EXISTS alert_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                is_active INTEGER DEFAULT 1,
                trigger_person_type VARCHAR DEFAULT 'blacklist',
                min_confidence REAL DEFAULT 0.0,
                channels TEXT DEFAULT '[]',
                cooldown_seconds INTEGER DEFAULT 300,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS alert_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_config_id INTEGER NOT NULL,
                face_event_id INTEGER,
                person_id INTEGER,
                person_type VARCHAR,
                channel_type VARCHAR,
                status VARCHAR DEFAULT 'sent',
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (alert_config_id) REFERENCES alert_configs(id) ON DELETE CASCADE
            )""",
            "CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events (created_at)",
            """CREATE TABLE IF NOT EXISTS webhook_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                url TEXT NOT NULL,
                secret VARCHAR,
                is_active INTEGER DEFAULT 1,
                event_types TEXT DEFAULT '["blacklist_detected"]',
                method VARCHAR DEFAULT 'POST',
                headers TEXT DEFAULT '{}',
                last_triggered_at DATETIME,
                last_status_code INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS camera_zones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                description TEXT,
                color VARCHAR DEFAULT '#3B82F6',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS camera_zone_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone_id INTEGER NOT NULL,
                camera_id INTEGER NOT NULL,
                FOREIGN KEY (zone_id) REFERENCES camera_zones(id) ON DELETE CASCADE,
                FOREIGN KEY (camera_id) REFERENCES camera_devices(id) ON DELETE CASCADE
            )""",
            "CREATE INDEX IF NOT EXISTS idx_zone_mappings_zone ON camera_zone_mappings (zone_id)",
            "CREATE INDEX IF NOT EXISTS idx_zone_mappings_camera ON camera_zone_mappings (camera_id)",
            """CREATE TABLE IF NOT EXISTS scheduled_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                report_type VARCHAR DEFAULT 'attendance',
                format VARCHAR DEFAULT 'excel',
                schedule_cron VARCHAR DEFAULT '0 8 * * 1',
                recipients TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                last_sent_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS ldap_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                is_active INTEGER DEFAULT 0,
                server_url VARCHAR NOT NULL DEFAULT 'ldap://localhost:389',
                bind_dn VARCHAR,
                bind_password TEXT,
                base_dn VARCHAR NOT NULL DEFAULT 'dc=example,dc=com',
                user_search_filter VARCHAR DEFAULT '(sAMAccountName={username})',
                default_role VARCHAR DEFAULT 'viewer',
                admin_groups TEXT DEFAULT '[]',
                operator_groups TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS user_camera_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                camera_id INTEGER NOT NULL,
                can_view INTEGER DEFAULT 1,
                can_view_live INTEGER DEFAULT 0,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (camera_id) REFERENCES camera_devices(id) ON DELETE CASCADE
            )""",
            "CREATE INDEX IF NOT EXISTS idx_ucp_user ON user_camera_permissions (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_ucp_camera ON user_camera_permissions (camera_id)",
        ]
        for statement in statements:
            op.execute(statement)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    for index_name in [
        "idx_ucp_camera",
        "idx_ucp_user",
        "idx_zone_mappings_camera",
        "idx_zone_mappings_zone",
        "idx_alert_events_created",
        "idx_refresh_tokens_hash",
        "idx_refresh_tokens_user",
    ]:
        op.execute(f"DROP INDEX IF EXISTS {index_name}")

    for table_name in [
        "user_camera_permissions",
        "ldap_configs",
        "scheduled_reports",
        "camera_zone_mappings",
        "camera_zones",
        "webhook_configs",
        "alert_events",
        "alert_configs",
        "refresh_tokens",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table_name}")

    if dialect == "postgresql":
        for table_name, column_name in [
            ("face_events", "gender"),
            ("face_events", "age"),
            ("camera_devices", "http_port"),
            ("camera_devices", "snapshot_mode"),
            ("users", "permissions"),
        ]:
            op.execute(f"ALTER TABLE {table_name} DROP COLUMN IF EXISTS {column_name}")
