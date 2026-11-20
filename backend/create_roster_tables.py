"""Safe, additive creation of the Step 20 roster tables.

This script creates ONLY the two new tables:

    rosters
    roster_entries

It uses SQLAlchemy's ``Table.create(bind=engine, checkfirst=True)`` so it is
idempotent: if a table already exists it is left untouched. It never calls
``metadata.create_all()``, never calls ``drop_all()``, never deletes rows, and
never alters any pre-existing table (employees, brands, processes, assignments,
staffing_requirements, leaves, weekly_offs, holidays, pods).

Run from the backend/ directory:

    .\\venv\\Scripts\\python.exe create_roster_tables.py
"""

from sqlalchemy import inspect

from app.database import engine
from app.models.roster import Roster, RosterEntry


def _existing_tables() -> set[str]:
    """Return the table names that exist in the connected database right now."""
    return set(inspect(engine).get_table_names())


def main() -> None:
    before = _existing_tables()
    print("Tables before creation:", ", ".join(sorted(before)))

    # Create only the two new tables, each guarded by checkfirst=True.
    Roster.__table__.create(bind=engine, checkfirst=True)
    RosterEntry.__table__.create(bind=engine, checkfirst=True)

    after = _existing_tables()
    print("Tables after creation: ", ", ".join(sorted(after)))

    created = sorted(after - before)
    if created:
        print("Created tables:", ", ".join(created))
    else:
        print("No new tables were created; both tables already existed.")

    missing = {"rosters", "roster_entries"} - after
    if missing:
        raise SystemExit(f"ERROR: required tables missing: {', '.join(sorted(missing))}")

    print("Step 20 roster tables are ready. No existing table or row was changed.")


if __name__ == "__main__":
    main()
