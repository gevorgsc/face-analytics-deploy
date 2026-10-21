import os

from app.env import load_app_env
from app.db import SessionLocal
from app.models import CameraDevice
from app.secrets import CAMERA_PASSWORD_PREFIX, encrypt_camera_password

load_app_env()


def main():
    if not os.getenv("CAMERA_PASSWORD_KEY"):
        raise RuntimeError("Set CAMERA_PASSWORD_KEY in .env before running this migration.")

    db = SessionLocal()
    updated = 0
    cleared_urls = 0

    try:
        cameras = db.query(CameraDevice).all()
        for camera in cameras:
            if camera.password and not camera.password.startswith(CAMERA_PASSWORD_PREFIX):
                camera.password = encrypt_camera_password(camera.password)
                updated += 1

            if camera.rtsp_url and not camera.rtsp_url.startswith(CAMERA_PASSWORD_PREFIX):
                camera.rtsp_url = encrypt_camera_password(camera.rtsp_url)
                cleared_urls += 1

        db.commit()
        print(f"Updated camera passwords: {updated}")
        print(f"Encrypted RTSP URL overrides: {cleared_urls}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
