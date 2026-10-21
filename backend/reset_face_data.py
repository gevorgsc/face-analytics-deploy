# -*- coding: utf-8 -*-
"""
reset_face_data.py -- GSC Face Analytics Pro
Clears all face events, persons, and audit logs.
Users and cameras are preserved.
Media image files are deleted.

Run: python reset_face_data.py
"""
import os
import shutil
from pathlib import Path


def confirm():
    print("\n!!! This will permanently delete:")
    print("   - All face_events")
    print("   - All persons")
    print("   - All audit_logs")
    print("   - All media image files")
    print("   Users and cameras will be kept.\n")
    ans = input("Type 'yes' to continue: ").strip().lower()
    return ans == "yes"


def reset_db():
    from app.db import engine
    from sqlalchemy import text

    print("Clearing database tables...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE face_events RESTART IDENTITY CASCADE"))
        conn.execute(text("TRUNCATE TABLE persons    RESTART IDENTITY CASCADE"))
        conn.execute(text("TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE"))
    print("  [OK] face_events, persons, audit_logs cleared. IDs reset to 1.")


def reset_media():
    base_dir = Path(__file__).parent
    media_dir = base_dir / "media"

    if not media_dir.exists():
        print("  Media dir not found, skipping.")
        return

    deleted_files = 0
    deleted_dirs = 0

    for item in media_dir.iterdir():
        if item.is_dir() and len(item.name) == 10 and item.name[4] == "-":
            count = sum(1 for f in item.rglob("*") if f.is_file())
            shutil.rmtree(item)
            deleted_files += count
            deleted_dirs += 1

    print(f"  [OK] Deleted {deleted_files} image files from {deleted_dirs} date folders.")


def reset_faiss():
    try:
        from app.faiss_engine import mark_faiss_dirty
        mark_faiss_dirty()
        print("  [OK] FAISS index marked dirty (will rebuild on next detection).")
    except Exception as e:
        print(f"  FAISS reset skipped: {e}")


if __name__ == "__main__":
    os.chdir(Path(__file__).parent)

    if not confirm():
        print("Cancelled.")
        exit(0)

    print()
    try:
        reset_db()
        reset_media()
        reset_faiss()
        print("\n[DONE] Reset complete. System ready for fresh start.")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        exit(1)
