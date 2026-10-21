from pathlib import Path

import pytest
from fastapi import HTTPException

from app.routers import maps


def test_safe_map_name_removes_path_and_shell_chars():
    assert maps._safe_map_name("../../Main Floor!?") == "Main_Floor"


def test_clean_area_name_normalizes_spaces():
    assert maps._clean_area_name("  Main   Entrance  ") == "Main Entrance"


def test_clean_area_name_rejects_blank():
    with pytest.raises(HTTPException) as exc:
        maps._clean_area_name("   ")

    assert exc.value.status_code == 400


def test_decode_map_image_rejects_non_image_bytes():
    with pytest.raises(HTTPException) as exc:
        maps._decode_map_image(b"not an image", "image/png", "floor.png")

    assert exc.value.status_code == 400


def test_decode_map_image_rejects_unsupported_extension():
    with pytest.raises(HTTPException) as exc:
        maps._decode_map_image(b"data", "image/svg+xml", "floor.svg")

    assert exc.value.status_code == 415


def test_map_file_path_stays_inside_maps_dir():
    resolved = maps._map_file_path("maps/floor.png")

    assert resolved is not None
    assert Path(maps.MAP_DIR).resolve() in resolved.parents


def test_floor_map_tracks_events_by_camera_id_contract():
    source = (Path(__file__).parents[1] / "app" / "routers" / "maps.py").read_text(encoding="utf-8")
    model = (Path(__file__).parents[1] / "app" / "models.py").read_text(encoding="utf-8")

    assert "camera_id = Column(Integer, ForeignKey(\"camera_devices.id\"" in model
    assert "cameras_by_id" in source
    assert "getattr(event, \"camera_id\", None)" in source


def test_prediction_uses_naive_yerevan_day_start_for_db_rows():
    source = (Path(__file__).parents[1] / "app" / "routers" / "maps.py").read_text(encoding="utf-8")

    assert "yerevan_day_start_utc().replace(tzinfo=None)" in source
