from datetime import timedelta

from app.auth import authenticate_token, create_access_token
from app.models import User


class _Query:
    def __init__(self, user):
        self.user = user

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.user


class _DB:
    def __init__(self, user):
        self.user = user

    def query(self, _model):
        return _Query(self.user)


def test_authenticate_token_accepts_active_user():
    user = User(id=7, username="operator", role="operator", is_active=1)
    token = create_access_token({"sub": "7"}, expires_delta=timedelta(minutes=5))

    assert authenticate_token(token, _DB(user)) is user


def test_authenticate_token_rejects_inactive_user():
    user = User(id=7, username="operator", role="operator", is_active=0)
    token = create_access_token({"sub": "7"}, expires_delta=timedelta(minutes=5))

    try:
        authenticate_token(token, _DB(user))
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 401
    else:
        raise AssertionError("Inactive users must not authenticate")
