import argparse
import os
import subprocess
from pathlib import Path

from app.backup import _parse_db_url, verify_backup
from app.env import load_app_env

load_app_env()


def restore_database(sql_file: str, psql_path: str | None = None) -> int:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    path = Path(sql_file)
    if not path.exists() or not path.is_file():
        raise RuntimeError(f"Backup file not found: {sql_file}")
    if not verify_backup(path):
        raise RuntimeError(f"Backup integrity verification failed: {sql_file}")

    cfg = _parse_db_url(database_url)
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = [
        psql_path or os.getenv("PSQL_PATH", "psql"),
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "-f", str(path),
    ]
    result = subprocess.run(cmd, env=env, text=True)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Restore Face Analytics PostgreSQL backup.")
    parser.add_argument("sql_file", help="Path to db_*.sql backup file")
    parser.add_argument("--psql-path", default=None, help="Optional full path to psql")
    args = parser.parse_args()

    code = restore_database(args.sql_file, args.psql_path)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
