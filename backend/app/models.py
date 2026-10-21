from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db import Base


class FloorMap(Base):
    __tablename__ = "floor_maps"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    image_path = Column(String, nullable=False)
    width      = Column(Integer, nullable=True)
    height     = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=True)
    person_type = Column(String, default="unknown", index=True)
    department = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    preview_image  = Column(String, nullable=True)
    face_embedding = Column(Text, nullable=True)
    card_number    = Column(String, nullable=True, index=True)  # physical access card number
    card_numbers   = Column(Text, nullable=True)  # JSON list, up to five ACS cards
    fingerprints   = Column(Text, nullable=True)  # JSON list of captured fingerprint templates

    first_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    seen_count = Column(Integer, default=0)

    # Unknown face grouping / repeat visitor foundation
    is_unknown_group = Column(Integer, default=0)
    unknown_label    = Column(String, nullable=True)
    last_camera_name = Column(String, nullable=True)

    # Access-control identity and HR metadata
    employee_no = Column(String, nullable=True, unique=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    gender = Column(String, nullable=True)
    position = Column(String, nullable=True)
    email = Column(String, nullable=True)
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    employment_date = Column(DateTime, nullable=True)
    pin_code = Column(String, nullable=True)
    max_access_times = Column(Integer, nullable=True)
    access_times_used = Column(Integer, default=0, nullable=False)
    acs_active = Column(Integer, default=1, nullable=False, index=True)
    acs_deactivated_at = Column(DateTime, nullable=True)
    super_access = Column(Integer, default=0)
    extended_access = Column(Integer, default=0)
    device_administrator = Column(Integer, default=0)
    acs_sync_status = Column(String, default="local")
    acs_sync_error = Column(Text, nullable=True)

    # 'fa' = created by Face Analytics detection/registration pipeline
    # 'acs' = registered via ACS Person Management (Hikvision controller)
    source = Column(String, default="fa", nullable=True)

    department_ref = relationship("Department")


class Department(Base):
    """Hierarchical organization unit used by ACS person management."""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True, index=True)
    code = Column(String, nullable=True, unique=True, index=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    parent = relationship("Department", remote_side=[id], backref="children")


class FaceEvent(Base):
    __tablename__ = "face_events"

    id = Column(Integer, primary_key=True, index=True)

    person_id = Column(Integer, ForeignKey("persons.id"), nullable=True, index=True)

    camera_ip = Column(String, nullable=True)
    camera_id = Column(Integer, ForeignKey("camera_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_name = Column(String, nullable=True, index=True)

    event_type = Column(String, nullable=True, index=True)
    # Keep Face Analytics detections separate from snapshots captured for ACS events.
    source = Column(String, default="face_analytics", nullable=False, index=True)

    image_path = Column(String, nullable=True)

    crop_image_path = Column(String, nullable=True)
    original_image_path = Column(String, nullable=True)

    confidence = Column(Float, nullable=True)

    # Multi-face metadata
    face_index = Column(Integer, nullable=True)
    face_count = Column(Integer, nullable=True)
    face_quality = Column(Float, nullable=True)
    quality_reason = Column(String, nullable=True)
    det_score = Column(Float, nullable=True)
    matched_unknown_group = Column(Integer, default=0)
    is_low_quality = Column(Integer, default=0)

    # IN/OUT direction at the moment of event: 'in', 'out', 'both', or NULL
    direction = Column(String, nullable=True)

    # Age / gender (extracted by buffalo_l genderage model)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)  # 'Male' or 'Female'

    raw_payload = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    person = relationship("Person")

    __table_args__ = (
        Index("ix_face_events_person_created", "person_id", "created_at"),
        Index("ix_face_events_camera_created", "camera_id", "created_at"),
        Index("ix_face_events_type_created", "event_type", "created_at"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin / operator / viewer
    permissions = Column(Text, default="[]")
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CameraDevice(Base):
    __tablename__ = "camera_devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ip_address = Column(String, index=True, nullable=False)
    port = Column(Integer, default=554)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    channel = Column(Integer, default=101)
    rtsp_url = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    is_active = Column(Integer, default=1)
    ai_enabled = Column(Integer, default=1)
    live_enabled = Column(Integer, default=1)
    # Direction: 'in' (entrance), 'out' (exit), 'both' (default - bidirectional)
    direction = Column(String, default="both")
    # Snapshot/stream protocol: 'hiksdk' | 'onvif'
    snapshot_mode = Column(String, default="hiksdk")
    # HTTP port for ONVIF access (default 80; SDK uses the `port` field above)
    http_port = Column(Integer, default=80)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Floor map placement
    map_id = Column(Integer, ForeignKey("floor_maps.id", ondelete="SET NULL"), nullable=True)
    map_x  = Column(Float, nullable=True)  # 0.0–1.0 relative to map image width
    map_y  = Column(Float, nullable=True)  # 0.0–1.0 relative to map image height



class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True)

    action = Column(String, nullable=False, index=True)

    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)

    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


# -- Enterprise: Refresh Tokens ------------------------------------------------

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


# -- Enterprise: Alert Configurations -----------------------------------------

class AlertConfig(Base):
    """Configures who gets alerted and how when specific events occur."""
    __tablename__ = "alert_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Integer, default=1)

    # Trigger conditions: person_type that triggers alert (blacklist, vip, unknown, any)
    trigger_person_type = Column(String, default="blacklist")
    min_confidence = Column(Float, default=0.0)

    # Delivery channels (JSON list of channel configs stored as text)
    channels = Column(Text, default="[]")  # JSON: [{type: email/slack/webhook, config: {...}}]

    # Cooldown: minimum seconds between alerts for same person
    cooldown_seconds = Column(Integer, default=300)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AlertEvent(Base):
    """History of sent alerts."""
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    alert_config_id = Column(Integer, ForeignKey("alert_configs.id", ondelete="CASCADE"), nullable=False)
    face_event_id = Column(Integer, ForeignKey("face_events.id", ondelete="SET NULL"), nullable=True)
    person_id = Column(Integer, nullable=True)
    person_type = Column(String, nullable=True)
    channel_type = Column(String, nullable=True)  # email / slack / webhook
    status = Column(String, default="sent")  # sent / failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    alert_config = relationship("AlertConfig")


# -- Enterprise: Webhook Integrations -----------------------------------------

class WebhookConfig(Base):
    """Outbound webhooks - push events to third-party systems."""
    __tablename__ = "webhook_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(Text, nullable=False)
    secret = Column(String, nullable=True)  # HMAC signing secret
    is_active = Column(Integer, default=1)

    # Event types to forward: JSON list e.g. ["blacklist_detected", "vip_detected"]
    event_types = Column(Text, default='["blacklist_detected"]')

    # HTTP method
    method = Column(String, default="POST")

    # Custom headers as JSON
    headers = Column(Text, default="{}")

    last_triggered_at = Column(DateTime, nullable=True)
    last_status_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# -- Enterprise: Camera Zones --------------------------------------------------

class CameraZone(Base):
    """Groups cameras into logical zones (floors, entrances, parking, etc.)."""
    __tablename__ = "camera_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String, default="#3B82F6")  # UI color code
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CameraZoneMapping(Base):
    """Maps cameras to zones (many-to-many)."""
    __tablename__ = "camera_zone_mappings"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("camera_zones.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id = Column(Integer, ForeignKey("camera_devices.id", ondelete="CASCADE"), nullable=False, index=True)

    zone = relationship("CameraZone")
    camera = relationship("CameraDevice")


# -- Enterprise: Scheduled Reports --------------------------------------------

class ScheduledReport(Base):
    """Auto-generated reports delivered via a schedule."""
    __tablename__ = "scheduled_reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    report_type = Column(String, default="attendance")
    format = Column(String, default="excel")  # excel / pdf / csv
    schedule_cron = Column(String, default="0 8 * * 1")  # cron expression (Mon 08:00)
    recipients = Column(Text, default="[]")  # JSON list of email addresses
    settings = Column(Text, default="{}")  # JSON: scope, period, language, delivery preferences
    is_active = Column(Integer, default=1)
    last_sent_at = Column(DateTime, nullable=True)
    last_run_status = Column(String, nullable=True)
    last_run_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ReportRun(Base):
    """Immutable history of generated and delivered report files."""
    __tablename__ = "report_runs"

    id = Column(Integer, primary_key=True, index=True)
    scheduled_report_id = Column(Integer, ForeignKey("scheduled_reports.id", ondelete="SET NULL"), nullable=True, index=True)
    report_name = Column(String, nullable=False)
    report_type = Column(String, nullable=False, index=True)
    format = Column(String, nullable=False)
    status = Column(String, default="generated", nullable=False, index=True)
    delivery_status = Column(String, nullable=True)
    parameters = Column(Text, default="{}")
    file_name = Column(String, nullable=True)
    file_path = Column(Text, nullable=True)
    row_count = Column(Integer, default=0)
    message = Column(Text, nullable=True)
    initiated_by = Column(String, nullable=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    completed_at = Column(DateTime, nullable=True)

    scheduled_report = relationship("ScheduledReport")


# -- Enterprise: LDAP Configuration -------------------------------------------

class LdapConfig(Base):
    """LDAP / Active Directory SSO configuration."""
    __tablename__ = "ldap_configs"

    id = Column(Integer, primary_key=True, index=True)
    is_active = Column(Integer, default=0)
    server_url = Column(String, nullable=False, default="ldap://localhost:389")
    bind_dn = Column(String, nullable=True)  # Service account DN
    bind_password = Column(Text, nullable=True)  # Encrypted
    base_dn = Column(String, nullable=False, default="dc=example,dc=com")
    user_search_filter = Column(String, default="(sAMAccountName={username})")
    default_role = Column(String, default="viewer")
    admin_groups = Column(Text, default="[]")   # JSON list of AD group DNs в†' admin
    operator_groups = Column(Text, default="[]")  # JSON list of AD group DNs в†' operator
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# -- App Settings (key-value store) -------------------------------------------

class AppSetting(Base):
    """Generic key-value settings store for runtime configuration."""
    __tablename__ = "app_settings"

    key        = Column(String, primary_key=True)
    value      = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


# -- Door / Relay Integration --------------------------------------------------

class DoorConfig(Base):
    """HTTP relay trigger fired when a matched face event is created."""
    __tablename__ = "door_configs"

    id                = Column(Integer, primary_key=True, index=True)
    name              = Column(String, nullable=False)
    trigger_url       = Column(Text, nullable=False)
    http_method       = Column(String, default="POST")
    # JSON list of person_types that trigger this door e.g. ["employee","vip"]
    trigger_types     = Column(Text, default='["employee","vip"]')
    min_confidence    = Column(Float, default=0.5)
    cooldown_seconds  = Column(Integer, default=5)
    is_active         = Column(Integer, default=1)
    headers           = Column(Text, default="{}")   # JSON extra headers
    payload_template  = Column(Text, nullable=True)  # optional JSON body template
    last_triggered_at = Column(DateTime, nullable=True)
    last_status_code  = Column(Integer, nullable=True)
    created_at        = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Floor map placement
    map_id            = Column(Integer, nullable=True)
    map_x             = Column(Float, nullable=True)   # 0.0–1.0 relative
    map_y             = Column(Float, nullable=True)


# -- Access Control Devices ---------------------------------------------------

class AccessControlDevice(Base):
    """Hikvision ACS controller (DS-K2xxx / DS-K1xxx series)."""
    __tablename__ = "access_control_devices"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String, nullable=False)
    ip_address   = Column(String, nullable=False, index=True)
    sdk_port     = Column(Integer, default=8000)
    http_port    = Column(Integer, default=80)         # ISAPI HTTP port
    username     = Column(String, default="admin")
    password     = Column(String, nullable=True)       # encrypted, same as camera
    door_count   = Column(Integer, default=1)          # how many doors on this controller
    # control_mode: 'isapi' (HTTP PUT, works on all models) | 'sdk' (HCNetSDK)
    control_mode = Column(String, default="isapi")
    location     = Column(String, nullable=True)
    notes        = Column(Text, nullable=True)
    is_active    = Column(Integer, default=1)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))

    events = relationship("AcsAccessEvent", back_populates="device",
                          cascade="all, delete-orphan")


class AcsAccessEvent(Base):
    """Access log: card swipes, door open/close, alarms from ACS controllers."""
    __tablename__ = "acs_access_events"

    id           = Column(Integer, primary_key=True, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    door_no      = Column(Integer, nullable=True, index=True)
    card_number  = Column(String, nullable=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True)
    # event_type: access_granted | access_denied | door_opened | door_closed | alarm | manual_unlock
    event_type   = Column(String, nullable=False, index=True)
    # verify_mode: card | face | fingerprint | card_and_face | manual
    verify_mode  = Column(String, nullable=True)
    error_code   = Column(Integer, nullable=True)
    denial_reason = Column(String, nullable=True)   # populated for access_denied events
    direction    = Column(String, nullable=True)    # 'in' | 'out' | None
    source_serial_no = Column(Integer, nullable=True, index=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    device = relationship("AccessControlDevice", back_populates="events")
    person = relationship("Person")

    __table_args__ = (
        Index("ix_acs_events_device_created", "device_id", "created_at"),
        Index("ix_acs_events_person_created", "person_id", "created_at"),
    )


# -- ACS Access Levels ---------------------------------------------------------

class AccessLevel(Base):
    """Named group of door access rights (e.g. 'HR Team', 'VIP Floor')."""
    __tablename__ = "access_levels"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    color       = Column(String, default="#3B82F6")
    # JSON: [{"device_id": 1, "door_numbers": [1, 2]}, ...]
    door_rules  = Column(Text, default="[]")
    # JSON: timezone, weekly periods, holiday behavior, controller plan mapping.
    schedule_config = Column(Text, default="{}")
    is_active   = Column(Integer, default=1)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))

    members = relationship("AccessLevelMember", back_populates="level",
                           cascade="all, delete-orphan")


class AccessLevelMember(Base):
    """Person assigned to an access level."""
    __tablename__ = "access_level_members"

    id              = Column(Integer, primary_key=True, index=True)
    access_level_id = Column(Integer, ForeignKey("access_levels.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    person_id       = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    valid_from      = Column(DateTime, nullable=True)
    valid_to        = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    level  = relationship("AccessLevel", back_populates="members")
    person = relationship("Person")


# -- ACS Card Issues -----------------------------------------------------------

class CardIssue(Base):
    """Physical access card issued to a person on a specific ACS device."""
    __tablename__ = "card_issues"

    id           = Column(Integer, primary_key=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    card_number  = Column(String, nullable=False, index=True)
    # card_type: normal | disabled | stress | super | visitor
    card_type    = Column(String, default="normal")
    valid_from   = Column(DateTime, nullable=True)
    valid_to     = Column(DateTime, nullable=True)
    # status: active | revoked | expired
    status       = Column(String, default="active", index=True)
    note         = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                          onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person")
    device = relationship("AccessControlDevice")

    __table_args__ = (
        Index("ix_card_issues_person_device_status", "person_id", "device_id", "status"),
    )


# -- Visitors ------------------------------------------------------------------

class Visitor(Base):
    """Temporary visitor access — issued a time-limited QR or card."""
    __tablename__ = "visitors"

    id           = Column(Integer, primary_key=True, index=True)
    full_name    = Column(String, nullable=False)
    phone        = Column(String, nullable=True)
    company      = Column(String, nullable=True)
    host_name    = Column(String, nullable=True)    # employee they're visiting
    host_person_id = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True)
    visit_reason = Column(String, nullable=True)
    id_type      = Column(String, nullable=True)
    id_number    = Column(String, nullable=True, index=True)
    photo_path   = Column(String, nullable=True)
    visitor_group = Column(String, nullable=True)
    access_level_id = Column(Integer, ForeignKey("access_levels.id", ondelete="SET NULL"), nullable=True)
    card_number  = Column(String, nullable=True, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="SET NULL"),
                          nullable=True)
    valid_from   = Column(DateTime, nullable=False)
    valid_to     = Column(DateTime, nullable=False)
    # status: pending | active | completed | cancelled
    status       = Column(String, default="pending", index=True)
    approval_status = Column(String, default="pending", index=True)
    reservation_code = Column(String, nullable=True, unique=True, index=True)
    self_service_token = Column(String, nullable=True, unique=True, index=True)
    qr_token     = Column(String, nullable=True, unique=True, index=True)
    note         = Column(Text, nullable=True)
    consent_accepted = Column(Integer, default=0)
    source       = Column(String, default="operator")
    checked_in_at  = Column(DateTime, nullable=True)
    checked_out_at = Column(DateTime, nullable=True)
    approved_by  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at  = Column(DateTime, nullable=True)
    created_by   = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                          onupdate=lambda: datetime.now(timezone.utc))

    device     = relationship("AccessControlDevice")
    creator    = relationship("User", foreign_keys=[created_by])
    approver   = relationship("User", foreign_keys=[approved_by])
    host_person = relationship("Person")
    access_level = relationship("AccessLevel")


class VisitorWatchEntry(Base):
    __tablename__ = "visitor_watch_entries"

    id = Column(Integer, primary_key=True)
    full_name = Column(String, nullable=True, index=True)
    organization = Column(String, nullable=True, index=True)
    id_type = Column(String, nullable=True)
    id_number = Column(String, nullable=True, index=True)
    match_method = Column(String, default="any")
    watch_type = Column(String, default="important")
    reason = Column(Text, nullable=True)
    is_active = Column(Integer, default=1)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class VisitorAccessRecord(Base):
    __tablename__ = "visitor_access_records"

    id = Column(Integer, primary_key=True)
    visitor_id = Column(Integer, ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    device_id = Column(Integer, ForeignKey("access_control_devices.id", ondelete="SET NULL"), nullable=True)
    note = Column(Text, nullable=True)
    occurred_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    operator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    visitor = relationship("Visitor")
    device = relationship("AccessControlDevice")


# -- Attendance Records --------------------------------------------------------

class AttendanceRecord(Base):
    """One record per person per work-day. Auto-populated from FaceEvents."""
    __tablename__ = "attendance_records"

    id           = Column(Integer, primary_key=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    work_date    = Column(String, nullable=False, index=True)  # "YYYY-MM-DD" Yerevan date
    check_in_at  = Column(DateTime, nullable=True)             # first detection of the day
    check_out_at = Column(DateTime, nullable=True)             # last detection of the day
    work_minutes = Column(Integer, nullable=True)              # check_out - check_in in minutes
    break_minutes = Column(Integer, default=0)
    overtime_minutes = Column(Integer, default=0)
    calculation_version = Column(Integer, default=1)
    # status: present | late | absent | early_exit | half_day | weekend | holiday | manual
    status       = Column(String, default="present", index=True)
    is_manual    = Column(Integer, default=0)                  # 1 = admin manually set
    note         = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                          onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person")

    __table_args__ = (
        Index("ix_attendance_person_date", "person_id", "work_date", unique=True),
    )


# -- Attendance Rules ----------------------------------------------------------

class AttendanceRule(Base):
    """Work-schedule rule for employee late/absent/early-exit detection."""
    __tablename__ = "attendance_rules"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False, default="Default Schedule")
    work_start    = Column(String, default="09:00")  # HH:MM Yerevan time
    work_end      = Column(String, default="18:00")  # HH:MM Yerevan time
    grace_minutes = Column(Integer, default=15)      # minutes after work_start → still on-time
    # Comma-separated ISO weekdays: 1=Mon ... 7=Sun
    work_days     = Column(String, default="1,2,3,4,5")
    is_active     = Column(Integer, default=1)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AttendanceGroup(Base):
    """Organizational attendance group with a default shift."""
    __tablename__ = "attendance_groups"

    id          = Column(Integer, primary_key=True)
    name        = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    color       = Column(String, default="#3B82F6")
    shift_id    = Column(Integer, ForeignKey("attendance_shifts.id", ondelete="SET NULL"), nullable=True)
    is_active   = Column(Integer, default=1)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))

    shift = relationship("AttendanceShift")


class AttendanceShift(Base):
    """Reusable shift/timetable definition."""
    __tablename__ = "attendance_shifts"

    id             = Column(Integer, primary_key=True)
    name           = Column(String, nullable=False, unique=True)
    work_start     = Column(String, default="09:00")
    work_end       = Column(String, default="18:00")
    break_minutes  = Column(Integer, default=60)
    calculation_mode = Column(String, default="first_last")
    overtime_enabled = Column(Integer, default=0)
    overtime_after_minutes = Column(Integer, default=0)
    min_punch_interval = Column(Integer, default=2)
    grace_minutes  = Column(Integer, default=15)
    early_minutes  = Column(Integer, default=0)
    minimum_minutes = Column(Integer, default=240)
    work_days      = Column(String, default="1,2,3,4,5")
    is_overnight   = Column(Integer, default=0)
    is_active      = Column(Integer, default=1)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))


class AttendanceSchedule(Base):
    """Assigns a person to a group/shift for an effective date range."""
    __tablename__ = "attendance_schedules"

    id         = Column(Integer, primary_key=True)
    person_id  = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id   = Column(Integer, ForeignKey("attendance_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    shift_id   = Column(Integer, ForeignKey("attendance_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    valid_from = Column(String, nullable=False)
    valid_to   = Column(String, nullable=True)
    is_active  = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person")
    group = relationship("AttendanceGroup")
    shift = relationship("AttendanceShift")


class AttendanceRequest(Base):
    """Leave, overtime, or check-in/out correction approval request."""
    __tablename__ = "attendance_requests"

    id            = Column(Integer, primary_key=True)
    person_id     = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    request_type  = Column(String, nullable=False, index=True)  # leave | overtime | correction
    date_from     = Column(String, nullable=False, index=True)
    date_to       = Column(String, nullable=False)
    start_time    = Column(String, nullable=True)
    end_time      = Column(String, nullable=True)
    correction_in = Column(String, nullable=True)
    correction_out = Column(String, nullable=True)
    reason        = Column(Text, nullable=True)
    status        = Column(String, default="pending", index=True)  # pending | approved | rejected
    reviewer_note = Column(Text, nullable=True)
    created_by    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_by   = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at   = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person")


class AttendanceBreak(Base):
    __tablename__ = "attendance_breaks"

    id = Column(Integer, primary_key=True)
    shift_id = Column(Integer, ForeignKey("attendance_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    paid = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    shift = relationship("AttendanceShift")


# ═══════════════════════════════════════════════════════════════════════════════
# ACS EXTENDED FEATURES
# ═══════════════════════════════════════════════════════════════════════════════

# -- Feature 1: Anti-Passback --------------------------------------------------

class AntiPassbackRule(Base):
    """Anti-passback rule: prevents re-entry without first exiting."""
    __tablename__ = "acs_antipassback_rules"

    id        = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    door_no   = Column(Integer, nullable=False)
    door_no_in = Column(Integer, nullable=True)
    door_no_out = Column(Integer, nullable=True)
    reset_hours = Column(Integer, default=12)
    mode      = Column(String, default="soft")   # soft (alert only) | hard (deny entry)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("AccessControlDevice")


class AntiPassbackState(Base):
    """Tracks last known direction per person per door."""
    __tablename__ = "acs_antipassback_states"

    id             = Column(Integer, primary_key=True, index=True)
    person_id      = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    device_id      = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    rule_id        = Column(Integer, ForeignKey("acs_antipassback_rules.id", ondelete="CASCADE"),
                            nullable=True, index=True)
    door_no        = Column(Integer, nullable=False)
    last_direction = Column(String, nullable=True)   # 'in' | 'out'
    last_event_at  = Column(DateTime, nullable=True)

    person = relationship("Person")
    rule = relationship("AntiPassbackRule")


class AntiPassbackViolation(Base):
    """Log of anti-passback violations."""
    __tablename__ = "acs_antipassback_violations"

    id                  = Column(Integer, primary_key=True, index=True)
    person_id           = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    device_id           = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                                 nullable=False, index=True)
    rule_id             = Column(Integer, ForeignKey("acs_antipassback_rules.id", ondelete="SET NULL"),
                                 nullable=True)
    door_no             = Column(Integer, nullable=True)
    card_number          = Column(String, nullable=True)
    attempted_direction = Column(String, nullable=True)
    mode                = Column(String, default="soft")
    created_at          = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    person = relationship("Person")
    device = relationship("AccessControlDevice")
    rule = relationship("AntiPassbackRule")


# -- Feature 3: Dual Authorization (Two-Person Rule) --------------------------

class DualAuthRule(Base):
    """Requires two different card swipes to open a high-security door."""
    __tablename__ = "acs_dual_auth_rules"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String, nullable=False)
    description     = Column(String, nullable=True)   # optional human-readable description
    device_id       = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    door_no         = Column(Integer, nullable=False)
    timeout_seconds = Column(Integer, default=30)
    is_active       = Column(Integer, default=1)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("AccessControlDevice")


class DualAuthPending(Base):
    """Temporary record while waiting for the second card swipe."""
    __tablename__ = "acs_dual_auth_pending"

    id                = Column(Integer, primary_key=True, index=True)
    rule_id           = Column(Integer, ForeignKey("acs_dual_auth_rules.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    first_person_id   = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    first_card_number = Column(String, nullable=True)
    expires_at        = Column(DateTime, nullable=False)
    created_at        = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    rule         = relationship("DualAuthRule")
    first_person = relationship("Person")


# -- Feature 4: Tailgating Detection ------------------------------------------

class TailgatingConfig(Base):
    """Per-door tailgating detection configuration."""
    __tablename__ = "acs_tailgating_configs"

    id                       = Column(Integer, primary_key=True, index=True)
    device_id                = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                                      nullable=False, index=True)
    door_no                  = Column(Integer, nullable=False)
    camera_id                = Column(Integer, ForeignKey("camera_devices.id", ondelete="SET NULL"), nullable=True)
    detection_window_seconds = Column(Integer, default=5)
    is_active                = Column(Integer, default=1)
    created_at               = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("AccessControlDevice")
    camera = relationship("CameraDevice")


class TailgatingEvent(Base):
    """Recorded tailgating incidents."""
    __tablename__ = "acs_tailgating_events"

    id                    = Column(Integer, primary_key=True, index=True)
    device_id             = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                                   nullable=False, index=True)
    door_no               = Column(Integer, nullable=True)
    authorized_person_id  = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    extra_face_count      = Column(Integer, default=1)
    event_image_path      = Column(String, nullable=True)
    is_resolved           = Column(Integer, default=0)
    resolved_at           = Column(DateTime, nullable=True)
    resolved_note         = Column(Text, nullable=True)
    created_at            = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    authorized_person = relationship("Person")


# -- Feature 5: Guard Tour ----------------------------------------------------

class GuardTour(Base):
    """Defines a security patrol route with ordered checkpoints."""
    __tablename__ = "acs_guard_tours"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    description      = Column(Text, nullable=True)
    schedule_cron    = Column(String, nullable=True)
    duration_minutes = Column(Integer, default=60)
    is_active        = Column(Integer, default=1)
    # Whether checkpoints must be visited in sequence order (1) or freely (0)
    is_ordered       = Column(Integer, default=1, nullable=False)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    checkpoints = relationship("GuardTourCheckpoint", back_populates="tour",
                               cascade="all, delete-orphan", order_by="GuardTourCheckpoint.sequence")


class GuardTourCheckpoint(Base):
    """An ordered checkpoint (door) on a guard tour."""
    __tablename__ = "acs_guard_tour_checkpoints"

    id            = Column(Integer, primary_key=True, index=True)
    tour_id       = Column(Integer, ForeignKey("acs_guard_tours.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    device_id     = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                           nullable=False)
    door_no       = Column(Integer, nullable=False)
    sequence      = Column(Integer, default=1)
    location_name = Column(String, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tour   = relationship("GuardTour", back_populates="checkpoints")
    device = relationship("AccessControlDevice")


class GuardTourExecution(Base):
    """A single run of a guard tour."""
    __tablename__ = "acs_guard_tour_executions"

    id                 = Column(Integer, primary_key=True, index=True)
    tour_id            = Column(Integer, ForeignKey("acs_guard_tours.id", ondelete="CASCADE"),
                                nullable=False, index=True)
    guard_person_id    = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    started_at         = Column(DateTime, nullable=True)
    completed_at       = Column(DateTime, nullable=True)
    status             = Column(String, default="pending", index=True)  # pending|in_progress|completed|missed|incomplete
    completion_percent = Column(Float, default=0.0)
    notes              = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tour  = relationship("GuardTour")
    guard = relationship("Person")
    checkpoint_logs = relationship("GuardTourCheckpointLog", back_populates="execution",
                                   cascade="all, delete-orphan")


class GuardTourCheckpointLog(Base):
    """Records when a guard scanned a checkpoint."""
    __tablename__ = "acs_guard_tour_checkpoint_logs"

    id            = Column(Integer, primary_key=True, index=True)
    execution_id  = Column(Integer, ForeignKey("acs_guard_tour_executions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    checkpoint_id = Column(Integer, ForeignKey("acs_guard_tour_checkpoints.id", ondelete="CASCADE"),
                           nullable=False)
    scanned_at    = Column(DateTime, nullable=True)
    is_completed  = Column(Integer, default=0)

    execution  = relationship("GuardTourExecution", back_populates="checkpoint_logs")
    checkpoint = relationship("GuardTourCheckpoint")


# -- Feature 7: Access Request Workflow ----------------------------------------

class AcsAccessRequest(Base):
    """Request by a person for access to specific doors or levels."""
    __tablename__ = "acs_access_requests"

    id              = Column(Integer, primary_key=True, index=True)
    person_id       = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    access_level_id = Column(Integer, ForeignKey("access_levels.id", ondelete="SET NULL"), nullable=True)
    door_rules      = Column(Text, nullable=True)
    reason          = Column(Text, nullable=True)
    valid_from      = Column(DateTime, nullable=True)
    valid_to        = Column(DateTime, nullable=True)
    status          = Column(String, default="pending", index=True)  # pending|approved|rejected
    reviewed_by     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)
    reviewer_note   = Column(Text, nullable=True)
    created_by      = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))

    person       = relationship("Person")
    access_level = relationship("AccessLevel")


# -- Feature 8: Holiday Calendar -----------------------------------------------

class AcsHoliday(Base):
    """Public or custom holiday that affects access schedules."""
    __tablename__ = "acs_holidays"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    date             = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    is_recurring     = Column(Integer, default=0)
    holiday_type     = Column(String, default="public")  # public | custom | restricted
    access_overrides = Column(Text, default="{}")        # JSON {level_id: "deny"|"allow"}
    notes            = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# -- Feature 9: Lift / Floor Access -------------------------------------------

class LiftConfig(Base):
    """Elevator controller configuration."""
    __tablename__ = "acs_lift_configs"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    device_id  = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    door_no    = Column(Integer, nullable=False)
    floors     = Column(Text, default="[]")  # JSON list e.g. ["B1","GF","1","2","Roof"]
    is_active  = Column(Integer, default=1)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device       = relationship("AccessControlDevice")
    floor_access = relationship("LiftFloorAccess", back_populates="lift",
                                cascade="all, delete-orphan")


class LiftFloorAccess(Base):
    """Which floors an access level can reach in a specific lift."""
    __tablename__ = "acs_lift_floor_accesses"

    id              = Column(Integer, primary_key=True, index=True)
    lift_id         = Column(Integer, ForeignKey("acs_lift_configs.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    access_level_id = Column(Integer, ForeignKey("access_levels.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    allowed_floors  = Column(Text, default="[]")
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    lift         = relationship("LiftConfig", back_populates="floor_access")
    access_level = relationship("AccessLevel")


# -- Feature 12: Access Policy Templates --------------------------------------

class AccessPolicyTemplate(Base):
    """Reusable door-access template cloneable to access levels."""
    __tablename__ = "acs_policy_templates"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String, nullable=False)
    description     = Column(Text, nullable=True)
    door_rules      = Column(Text, default="[]")
    schedule_config = Column(Text, default="{}")
    tags            = Column(String, nullable=True)
    is_active       = Column(Integer, default=1)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))


# -- Feature 13: Door Camera Auto-Snapshot ------------------------------------

class DoorCameraSnapshotMapping(Base):
    """Links an ACS door to a camera for automatic snapshot on access events."""
    __tablename__ = "acs_door_snapshot_mappings"

    id             = Column(Integer, primary_key=True, index=True)
    device_id      = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    door_no        = Column(Integer, nullable=False)
    camera_id      = Column(Integer, ForeignKey("camera_devices.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    trigger_events = Column(Text, default='["access_granted","access_denied"]')
    is_active      = Column(Integer, default=1)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("AccessControlDevice")
    camera = relationship("CameraDevice")


# -- Feature 14: Mobile Virtual Card ------------------------------------------

class MobileCard(Base):
    """Virtual QR-based mobile access card issued to a person."""
    __tablename__ = "acs_mobile_cards"

    id           = Column(Integer, primary_key=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="SET NULL"), nullable=True)
    token        = Column(String, unique=True, nullable=False, index=True)
    card_number  = Column(String, nullable=True)
    valid_from   = Column(DateTime, nullable=False)
    valid_to     = Column(DateTime, nullable=True)
    status       = Column(String, default="active", index=True)  # active|revoked|expired
    last_used_at = Column(DateTime, nullable=True)
    issued_by    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    person = relationship("Person")
    device = relationship("AccessControlDevice")


# -- Feature 15: Real-Time Zone Occupancy -------------------------------------

class OccupancyZone(Base):
    """A named zone tracked by IN/OUT door events for real-time headcount."""
    __tablename__ = "acs_occupancy_zones"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String, nullable=False)
    description  = Column(Text, nullable=True)
    max_capacity = Column(Integer, nullable=True)
    color        = Column(String, default="#3B82F6")
    door_rules   = Column(Text, default="[]")  # JSON [{device_id,door_no,direction}]
    is_active    = Column(Integer, default=1)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    entries = relationship("OccupancyZoneEntry", back_populates="zone",
                           cascade="all, delete-orphan")


class OccupancyZoneEntry(Base):
    """Tracks persons currently inside an occupancy zone."""
    __tablename__ = "acs_occupancy_entries"

    id          = Column(Integer, primary_key=True, index=True)
    zone_id     = Column(Integer, ForeignKey("acs_occupancy_zones.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    person_id   = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True)
    card_number = Column(String, nullable=True)
    entered_at  = Column(DateTime, nullable=False)
    exited_at   = Column(DateTime, nullable=True)  # NULL = still inside

    zone   = relationship("OccupancyZone", back_populates="entries")
    person = relationship("Person")


# -- Face → Door Auto-Unlock Mapping ------------------------------------------

class CameraDoorMapping(Base):
    """Links a face-recognition camera to an ACS door for auto-unlock on match."""
    __tablename__ = "camera_door_mappings"

    id              = Column(Integer, primary_key=True, index=True)
    camera_id       = Column(Integer, ForeignKey("camera_devices.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    acs_device_id   = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    door_no         = Column(Integer, default=1)
    # Which person types are allowed: JSON list e.g. ["employee","vip"]
    allowed_types   = Column(Text, default='["employee","vip"]')
    min_confidence  = Column(Float, default=0.65)
    # require_face: if True, ACS card swipe ALSO needs a recent face match
    require_face    = Column(Integer, default=0)
    # cooldown_seconds: min seconds between unlocks for same person
    cooldown_seconds = Column(Integer, default=5)
    is_active       = Column(Integer, default=1)
    name            = Column(String, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))


# -- ACS Offline Card Cache ---------------------------------------------------

class AcsOfflineCard(Base):
    """Local mirror of cards issued on ACS devices — used when device is offline."""
    __tablename__ = "acs_offline_cards"

    id           = Column(Integer, primary_key=True, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    card_number  = Column(String, nullable=False, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                          nullable=True, index=True)
    person_name  = Column(String, nullable=True)
    person_type  = Column(String, nullable=True)
    valid_from   = Column(DateTime, nullable=True)
    valid_to     = Column(DateTime, nullable=True)
    is_active    = Column(Integer, default=1)
    synced_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("AccessControlDevice")
    person = relationship("Person")


# -- ACS Denial Log -----------------------------------------------------------

class AcsDenialLog(Base):
    """Detailed log of access denials — reason, who, where, when."""
    __tablename__ = "acs_denial_logs"

    id           = Column(Integer, primary_key=True, index=True)
    device_id    = Column(Integer, ForeignKey("access_control_devices.id", ondelete="SET NULL"),
                          nullable=True, index=True)
    door_no      = Column(Integer, nullable=True)
    card_number  = Column(String, nullable=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"),
                          nullable=True, index=True)
    # denial_reason: no_access | expired_card | invalid_card | blacklisted |
    #                face_mismatch | device_offline | unknown
    denial_reason = Column(String, nullable=False, default="unknown", index=True)
    detail        = Column(Text, nullable=True)
    source        = Column(String, default="acs")  # 'acs' | 'face_engine' | 'offline'
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    device = relationship("AccessControlDevice")
    person = relationship("Person")


# -- ACS Face Match Cache (for dual-factor) -----------------------------------

class AcsFaceMatchCache(Base):
    """Short-lived cache of recent face matches — used for dual-factor verification."""
    __tablename__ = "acs_face_match_cache"

    id           = Column(Integer, primary_key=True, index=True)
    person_id    = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    camera_id    = Column(Integer, ForeignKey("camera_devices.id", ondelete="CASCADE"),
                          nullable=True, index=True)
    confidence   = Column(Float, nullable=True)
    matched_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    person = relationship("Person")
