"""
repair_missing_images.py
Fixes face_events rows whose crop_image_path / image_path no longer exist on disk.
Falls back: crop → box → original. Updates DB to point to the best existing image.
Run once: python repair_missing_images.py
"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "face_analytics.db")
MEDIA_ROOT = os.path.dirname(__file__)


def resolve(path):
    if not path:
        return None
    full = os.path.join(MEDIA_ROOT, path.lstrip("/").replace("/", os.sep))
    return full if os.path.exists(full) else None


def best_image(crop, box, original):
    """Return the best existing path among the three, or None."""
    return resolve(crop) and crop or resolve(box) and box or resolve(original) and original or None


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, image_path, crop_image_path, original_image_path FROM face_events")
    rows = cur.fetchall()

    fixed_crop = 0
    fixed_box = 0
    no_image = 0

    for event_id, box, crop, original in rows:
        crop_ok = bool(resolve(crop))
        box_ok = bool(resolve(box))

        if crop_ok:
            continue  # nothing to fix

        # crop is missing — find best fallback
        new_crop = None
        if box_ok:
            new_crop = box
            fixed_crop += 1
        elif resolve(original):
            new_crop = original
            fixed_crop += 1
        else:
            no_image += 1

        cur.execute(
            "UPDATE face_events SET crop_image_path = ? WHERE id = ?",
            (new_crop, event_id),
        )

        # Also fix box if missing
        if not box_ok:
            new_box = resolve(original) and original or None
            if new_box:
                fixed_box += 1
            cur.execute(
                "UPDATE face_events SET image_path = ? WHERE id = ?",
                (new_box, event_id),
            )

    conn.commit()

    # Fix persons whose preview_image is missing
    cur.execute("SELECT id, preview_image FROM persons WHERE preview_image IS NOT NULL")
    person_rows = cur.fetchall()
    fixed_persons = 0
    for pid, preview in person_rows:
        if resolve(preview):
            continue
        # Find best event image for this person
        cur.execute(
            "SELECT image_path, crop_image_path, original_image_path FROM face_events "
            "WHERE person_id = ? AND (image_path IS NOT NULL OR original_image_path IS NOT NULL) "
            "LIMIT 1",
            (pid,),
        )
        ev = cur.fetchone()
        if ev:
            new_preview = best_image(ev[1], ev[0], ev[2])
            cur.execute("UPDATE persons SET preview_image = ? WHERE id = ?", (new_preview, pid))
            fixed_persons += 1
        else:
            cur.execute("UPDATE persons SET preview_image = NULL WHERE id = ?", (pid,))
            fixed_persons += 1

    conn.commit()
    conn.close()

    print(f"Done.")
    print(f"  Events: {fixed_crop} crop paths fixed, {fixed_box} box paths fixed, {no_image} with no image at all.")
    print(f"  Persons: {fixed_persons} preview_image paths updated.")


if __name__ == "__main__":
    main()
