from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = Path(__file__).resolve().parent


def load_app_env() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(APP_DIR / ".env", override=False)
