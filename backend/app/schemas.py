from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime

VALID_PERSON_TYPES = {"employee", "vip", "blacklist", "unknown"}


class PersonOut(BaseModel):
    id: int
    full_name: Optional[str] = None
    person_type: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    preview_image: Optional[str] = None
    seen_count: Optional[int] = 0
    is_unknown_group: Optional[int] = 0
    unknown_label: Optional[str] = None
    last_camera_name: Optional[str] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class PersonUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=120)
    person_type: Optional[str] = None
    department: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=30)
    notes: Optional[str] = Field(None, max_length=2000)
    preview_image: Optional[str] = None

    @field_validator("person_type")
    @classmethod
    def validate_person_type(cls, v):
        if v is not None and v not in VALID_PERSON_TYPES:
            raise ValueError(f"person_type must be one of {VALID_PERSON_TYPES}")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v is not None:
            cleaned = "".join(c for c in v if c.isdigit() or c in "+-() ")
            if v and not cleaned:
                raise ValueError("Invalid phone format")
        return v


class EventOut(BaseModel):
    id: int
    person_id: Optional[int] = None
    camera_id: Optional[int] = None
    camera_ip: Optional[str] = None
    camera_name: Optional[str] = None
    event_type: Optional[str] = None
    source: Optional[str] = None

    image_path: Optional[str] = None
    crop_image_path: Optional[str] = None
    original_image_path: Optional[str] = None

    confidence: Optional[float] = None
    face_index: Optional[int] = None
    face_count: Optional[int] = None
    face_quality: Optional[float] = None
    quality_reason: Optional[str] = None
    det_score: Optional[float] = None
    matched_unknown_group: Optional[int] = 0
    is_low_quality: Optional[int] = 0
    direction: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    created_at: Optional[datetime] = None
    person: Optional[PersonOut] = None

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
