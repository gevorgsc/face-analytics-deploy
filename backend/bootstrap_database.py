"""Prepare the database for local/dev startup.

Fresh databases are initialized from SQLAlchemy models and stamped to the
current Alembic head because the existing migration chain starts from an
already-created base schema. Databases that already have tables use Alembic
normally.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db import Base, engine
from app import models  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _alembic_config() -> Config:
    return Config(str(ALEMBIC_INI))


def _app_tables() -> list[str]:
    tables = inspect(engine).get_table_names()
    return sorted(table for table in tables if table != "alembic_version")


def main() -> None:
    tables = _app_tables()
    config = _alembic_config()

    if not tables:
        print(">>> Empty database detected. Creating base schema...")
        Base.metadata.create_all(bind=engine)
        print(">>> Stamping Alembic head...")
        command.stamp(config, "head")
        print(">>> Database bootstrap complete.")
        return

    print(">>> Existing database detected. Running Alembic migrations...")
    command.upgrade(config, "head")
    print(">>> Database migrations complete.")


if __name__ == "__main__":
    main()
