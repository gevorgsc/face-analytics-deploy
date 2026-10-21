import re
from pathlib import Path

from app.models import Base


EXPECTED_EXTENDED_ACS_TABLES = {
    "acs_access_requests",
    "acs_antipassback_rules",
    "acs_antipassback_states",
    "acs_antipassback_violations",
    "acs_denial_logs",
    "acs_door_snapshot_mappings",
    "acs_dual_auth_pending",
    "acs_dual_auth_rules",
    "acs_face_match_cache",
    "acs_guard_tour_checkpoint_logs",
    "acs_guard_tour_checkpoints",
    "acs_guard_tour_executions",
    "acs_guard_tours",
    "acs_holidays",
    "acs_lift_configs",
    "acs_lift_floor_accesses",
    "acs_mobile_cards",
    "acs_occupancy_entries",
    "acs_occupancy_zones",
    "acs_offline_cards",
    "acs_policy_templates",
    "acs_tailgating_configs",
    "acs_tailgating_events",
    "camera_door_mappings",
}


def test_extended_acs_models_have_database_migration():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "309e2631e5f7_add_extended_acs_feature_tables.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")
    migrated_tables = set(re.findall(r"op\.create_table\('([^']+)'", migration_source))

    assert EXPECTED_EXTENDED_ACS_TABLES <= set(Base.metadata.tables)
    assert migrated_tables == EXPECTED_EXTENDED_ACS_TABLES
