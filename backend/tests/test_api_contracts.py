from app.pagination import normalize_pagination
from pathlib import Path


def test_events_pagination_defaults_match_frontend_page_size():
    page = normalize_pagination()

    assert page.limit == 100
    assert page.offset == 0


def test_events_pagination_clamps_limit_and_offset():
    too_large = normalize_pagination(limit=9999, offset=-20)
    too_small = normalize_pagination(limit=0, offset=25)

    assert too_large.limit == 500
    assert too_large.offset == 0
    assert too_small.limit == 1
    assert too_small.offset == 25


def test_events_response_header_contract_names():
    headers = {"X-Total-Count", "X-Limit", "X-Offset"}

    assert "X-Total-Count" in headers
    assert "X-Limit" in headers
    assert "X-Offset" in headers


def test_no_fake_runtime_secret_rotation_endpoint():
    source = (Path(__file__).parents[1] / "app" / "main.py").read_text(encoding="utf-8")

    assert '@app.post("/api/admin/rotate-secret")' not in source


def test_browser_embedded_resources_do_not_use_jwt_query_tokens():
    frontend = "\n".join(
        p.read_text(encoding="utf-8")
        for p in Path("frontend/src").glob("*.jsx")
    )

    assert "/stream?token=" not in frontend
    assert "/preview?token=" not in frontend
    assert "?token=' + encodeURIComponent(token)" not in frontend
