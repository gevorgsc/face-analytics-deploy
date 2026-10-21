from sqlalchemy import inspect, text
from app.db import engine

COLUMNS = {
    "face_events": [
        ("is_low_quality", "INTEGER DEFAULT 0"),
        ("face_quality", "FLOAT"),
        ("quality_reason", "VARCHAR"),
        ("det_score", "FLOAT"),
        ("face_index", "INTEGER"),
        ("face_count", "INTEGER"),
        ("matched_unknown_group", "INTEGER DEFAULT 0"),
    ],
    "persons": [
        ("is_unknown_group", "INTEGER DEFAULT 0"),
        ("unknown_label", "VARCHAR"),
        ("last_camera_name", "VARCHAR"),
    ],
}

def add_column_if_missing(table_name: str, column_name: str, column_type: str):
    inspector = inspect(engine)
    existing = {c["name"] for c in inspector.get_columns(table_name)}
    if column_name in existing:
        print(f"OK: {table_name}.{column_name} already exists")
        return

    dialect = engine.dialect.name
    if dialect == "postgresql":
        sql = f'ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {column_type}'
    else:
        sql = f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}'

    with engine.begin() as conn:
        conn.execute(text(sql))

    print(f"ADDED: {table_name}.{column_name}")

def main():
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    for table, columns in COLUMNS.items():
        if table not in tables:
            print(f"SKIP: table {table} does not exist")
            continue

        for column_name, column_type in columns:
            add_column_if_missing(table, column_name, column_type)

    print("Low quality migration completed.")

if __name__ == "__main__":
    main()
