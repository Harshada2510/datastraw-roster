"""Automated tests for Step 20 (Monthly Roster Generation).

Uses an isolated in-memory SQLite database via a get_db dependency override.
No MySQL connection is made and no production data is touched.
"""

import asyncio
import json
import unittest
from datetime import date

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    Brand,
    Employee,
    EmployeeAssignment,
    Process,
    Roster,
    RosterEntry,
    StaffingRequirement,
)


class Step20RosterTests(unittest.TestCase):
    """End-to-end roster API tests with a fresh SQLite database per test."""

    @classmethod
    def setUpClass(cls):
        cls.test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestSession = sessionmaker(
            bind=cls.test_engine, autocommit=False, autoflush=False
        )
        cls.saved_overrides = dict(app.dependency_overrides)

        def override_get_db():
            db = cls.TestSession()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        app.dependency_overrides.update(cls.saved_overrides)
        cls.test_engine.dispose()

    def setUp(self):
        # This is an in-memory SQLite test database only; production data is
        # never dropped or reset.
        Base.metadata.drop_all(self.test_engine)
        Base.metadata.create_all(self.test_engine)

    # ---------- ASGI helper ----------

    @staticmethod
    async def _call(method, path, query=b"", body=None):
        payload = json.dumps(body).encode() if body is not None else b""
        headers = [(b"content-type", b"application/json")] if body is not None else []
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": query,
            "headers": headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
        messages = []

        async def receive():
            return {"type": "http.request", "body": payload, "more_body": False}

        async def send(message):
            messages.append(message)

        await app(scope, receive, send)
        status = next(
            message["status"]
            for message in messages
            if message["type"] == "http.response.start"
        )
        raw = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        return status, json.loads(raw) if raw else None

    def request(self, method, path, query=b"", body=None):
        return asyncio.run(self._call(method, path, query, body))

    # ---------- seed helpers ----------

    def seed_employee(self, code, name, *, active=True):
        with self.TestSession() as db:
            employee = Employee(
                employee_code=code, full_name=name, is_active=active
            )
            db.add(employee)
            db.commit()
            db.refresh(employee)
            return employee.id

    def seed_brand(self, name, *, active=True):
        with self.TestSession() as db:
            brand = Brand(brand_name=name, is_active=active)
            db.add(brand)
            db.commit()
            db.refresh(brand)
            return brand.id

    def seed_process(self, name, *, active=True):
        with self.TestSession() as db:
            process = Process(process_name=name, is_active=active)
            db.add(process)
            db.commit()
            db.refresh(process)
            return process.id

    def seed_assignment(self, employee_id, brand_id, process_id):
        with self.TestSession() as db:
            db.add(
                EmployeeAssignment(
                    employee_id=employee_id,
                    brand_id=brand_id,
                    process_id=process_id,
                )
            )
            db.commit()

    def seed_requirement(
        self, brand_id, process_id, start_date, end_date, required_count
    ):
        with self.TestSession() as db:
            requirement = StaffingRequirement(
                brand_id=brand_id,
                process_id=process_id,
                start_date=start_date,
                end_date=end_date,
                required_count=required_count,
            )
            db.add(requirement)
            db.commit()
            db.refresh(requirement)
            return requirement.id

    def set_employee_active(self, employee_id, active):
        with self.TestSession() as db:
            employee = db.get(Employee, employee_id)
            employee.is_active = active
            db.commit()

    def stored_entry_count(self, roster_id):
        with self.TestSession() as db:
            return len(
                db.execute(
                    select(RosterEntry).where(RosterEntry.roster_id == roster_id)
                ).scalars().all()
            )

    # ---------- tests ----------

    def test_successful_generation(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 201)
        self.assertEqual(data["month"], 12)
        self.assertEqual(data["year"], 2026)
        self.assertEqual(data["month_name"], "December")
        self.assertEqual(data["days_in_month"], 31)
        self.assertEqual(data["eligible_employees"], 1)
        self.assertEqual(data["total_requirements"], 1)
        self.assertEqual(data["total_required_staff"], 1)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(data["total_employees_scheduled"], 1)
        self.assertEqual(data["uncovered_count"], 0)
        self.assertEqual(data["uncovered"], [])
        self.assertEqual(len(data["entries"]), 1)
        self.assertEqual(data["entries"][0]["employee_code"], "E1")
        self.assertEqual(data["entries"][0]["roster_date"], "2026-12-01")
        self.assertEqual(self.stored_entry_count(data["roster_id"]), 1)

    def test_missing_staffing_requirements(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 422)
        self.assertIn("No staffing requirements", data["detail"])
        with self.TestSession() as db:
            self.assertEqual(db.execute(select(Roster)).scalars().all(), [])

    def test_no_eligible_employees_because_all_inactive(self):
        employee = self.seed_employee("E1", "Inactive Employee", active=False)
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 0)
        self.assertEqual(data["eligible_employees"], 0)
        self.assertEqual(data["uncovered_count"], 1)
        self.assertEqual(data["uncovered"][0]["shortage"], 1)
        self.assertEqual(
            data["uncovered"][0]["reason"], "Insufficient eligible employees"
        )
        self.assertEqual(self.stored_entry_count(data["roster_id"]), 0)

    def test_duplicate_generation_prevention(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        first_status, first_data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )
        second_status, second_data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 409)
        self.assertIn("already exists", second_data["detail"])
        self.assertEqual(self.stored_entry_count(first_data["roster_id"]), 1)

    def test_insufficient_employee_capacity(self):
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        for index in range(2):
            employee = self.seed_employee(f"E{index + 1}", f"Employee {index + 1}")
            self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 5
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 2)
        self.assertEqual(data["uncovered_count"], 1)
        self.assertEqual(data["uncovered"][0]["required_count"], 5)
        self.assertEqual(data["uncovered"][0]["assigned_count"], 2)
        self.assertEqual(data["uncovered"][0]["shortage"], 3)
        self.assertEqual(len(data["entries"]), 2)

    def test_invalid_month_and_year(self):
        for body in (
            {"month": 0, "year": 2026},
            {"month": 13, "year": 2026},
            {"month": 12, "year": 1999},
            {"month": 12, "year": 2101},
        ):
            status, _ = self.request(
                "POST", "/api/rosters/generate", body=body
            )
            self.assertEqual(status, 422, body)

        for path in ("/api/rosters/2026/0", "/api/rosters/2026/13"):
            status, _ = self.request("GET", path)
            self.assertEqual(status, 422, path)

        with self.TestSession() as db:
            self.assertEqual(db.execute(select(Roster)).scalars().all(), [])

    def test_regeneration_replaces_entries_in_one_transaction(self):
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee_one, brand, process)
        self.seed_assignment(employee_two, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        first_status, first_data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )
        self.assertEqual(first_status, 201)
        self.assertEqual(first_data["entries"][0]["employee_code"], "E1")

        self.set_employee_active(employee_one, False)

        second_status, second_data = self.request(
            "POST", "/api/rosters/regenerate", body={"month": 12, "year": 2026}
        )
        self.assertEqual(second_status, 200)
        self.assertEqual(second_data["roster_id"], first_data["roster_id"])
        self.assertEqual(second_data["total_entries"], 1)
        self.assertEqual(second_data["entries"][0]["employee_code"], "E2")
        self.assertEqual(self.stored_entry_count(second_data["roster_id"]), 1)

        with self.TestSession() as db:
            self.assertEqual(len(db.execute(select(Roster)).scalars().all()), 1)

    def test_regenerate_without_existing_roster_creates_one(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        status, data = self.request(
            "POST", "/api/rosters/regenerate", body={"month": 12, "year": 2026}
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(self.stored_entry_count(data["roster_id"]), 1)

    def test_inactive_brand_and_process_reported_as_unavailable(self):
        self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Inactive Brand", active=False)
        process = self.seed_process("Inactive Process", active=False)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 2
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 0)
        self.assertEqual(data["uncovered_count"], 1)
        item = data["uncovered"][0]
        self.assertEqual(item["assigned_count"], 0)
        self.assertEqual(item["shortage"], 2)
        self.assertIn("Unavailable:", item["reason"])
        self.assertIn(f"Brand #{brand} is inactive", item["reason"])
        self.assertIn(f"Process #{process} is inactive", item["reason"])

    def test_double_booking_prevention_across_pairs(self):
        employee = self.seed_employee("E1", "Employee One")
        brand_one = self.seed_brand("Brand One")
        brand_two = self.seed_brand("Brand Two")
        process_one = self.seed_process("Process One")
        process_two = self.seed_process("Process Two")
        self.seed_assignment(employee, brand_one, process_one)
        self.seed_assignment(employee, brand_two, process_two)
        self.seed_requirement(
            brand_one, process_one, date(2026, 12, 1), date(2026, 12, 1), 1
        )
        self.seed_requirement(
            brand_two, process_two, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )

        self.assertEqual(status, 201)
        self.assertEqual(data["total_required_staff"], 2)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(data["uncovered_count"], 1)
        self.assertEqual(
            len({entry["roster_date"] for entry in data["entries"]}), 1
        )
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date).where(
                    RosterEntry.roster_id == data["roster_id"]
                )
            ).all()
            self.assertEqual(len(rows), len(set(rows)))

    def test_fair_deterministic_distribution(self):
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee_one, brand, process)
        self.seed_assignment(employee_two, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 3), 1
        )

        status, data = self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )
        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 3)

        counts = {}
        for entry in data["entries"]:
            counts[entry["employee_code"]] = counts.get(entry["employee_code"], 0) + 1
        self.assertEqual(sorted(counts.values()), [1, 2])

        # Regeneration with unchanged data must produce the same distribution.
        second_status, second_data = self.request(
            "POST", "/api/rosters/regenerate", body={"month": 12, "year": 2026}
        )
        self.assertEqual(second_status, 200)
        second_counts = {}
        for entry in second_data["entries"]:
            second_counts[entry["employee_code"]] = (
                second_counts.get(entry["employee_code"], 0) + 1
            )
        self.assertEqual(counts, second_counts)

    def test_get_existing_and_missing_roster(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(2026, 12, 1), date(2026, 12, 1), 1
        )

        missing_status, _ = self.request("GET", "/api/rosters/2026/12")
        self.assertEqual(missing_status, 404)

        self.request(
            "POST", "/api/rosters/generate", body={"month": 12, "year": 2026}
        )
        status, data = self.request("GET", "/api/rosters/2026/12")
        self.assertEqual(status, 200)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(len(data["entries"]), 1)


if __name__ == "__main__":
    unittest.main()
