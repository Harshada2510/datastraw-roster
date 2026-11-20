"""Safe additive migration for the Step 21 roster planning snapshot.

Adds ONE nullable column to the EXISTING ``rosters`` table:

    planning_json TEXT NULL

It never drops, truncates, resets or rewrites any table or row. Existing Step 20
rosters simply have NULL for this column and stay readable. The script is
idempotent: if the column already exists it exits without changing anything.

Run from the backend/ directory:

    .\\venv\\Scripts\\python.exe add_roster_planning_column.py
"""

from sqlalchemy import inspect, text

from app.database import engine

TABLE_NAME = "rosters"
COLUMN_NAME = "planning_json"


def main() -> None:
    columns = {column["name"] for column in inspect(engine).get_columns(TABLE_NAME)}
    print(f"Columns in {TABLE_NAME} before: {', '.join(sorted(columns))}")

    if COLUMN_NAME in columns:
        print(f"Column {COLUMN_NAME} already exists; no database change made.")
        return

    with engine.begin() as connection:
        connection.execute(
            text(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {COLUMN_NAME} TEXT NULL")
        )

    after = {column["name"] for column in inspect(engine).get_columns(TABLE_NAME)}
    print(f"Columns in {TABLE_NAME} after:  {', '.join(sorted(after))}")
    if COLUMN_NAME not in after:
        raise SystemExit(f"ERROR: {COLUMN_NAME} was not created.")
    print("Added planning_json. No existing table or row was removed or modified.")


if __name__ == "__main__":
    main()
