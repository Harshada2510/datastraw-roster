"""Automated tests for Step 21 (Weekly-Off & Holiday Allocation).

Uses an isolated in-memory SQLite database via a get_db dependency override.
No MySQL connection is made and no production data is touched.
"""

import asyncio
import calendar
import json
import unittest
from datetime import date, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    Brand,
    Employee,
    EmployeeAssignment,
    Holiday,
    Process,
    Roster,
    RosterEntry,
    StaffingRequirement,
    WeeklyOff,
)

YEAR = 2026
MONTH = 12


def first_weekday(year, month, weekday_name):
    """First date of a given weekday name inside a month."""
    target = list(calendar.day_name).index(weekday_name)
    current = date(year, month, 1)
    while current.weekday() != target:
        current += timedelta(days=1)
    return current


class Step21AvailabilityTests(unittest.TestCase):
    """End-to-end roster API tests covering weekly offs and holidays."""

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
        # In-memory SQLite only; production data is never dropped or reset.
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

    def generate(self, month=MONTH, year=YEAR, regenerate=False):
        path = "/api/rosters/regenerate" if regenerate else "/api/rosters/generate"
        return self.request("POST", path, body={"month": month, "year": year})

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

    def seed_weekly_off(self, employee_id, day_of_week):
        with self.TestSession() as db:
            record = WeeklyOff(
                employee_id=employee_id, day_of_week=day_of_week
            )
            db.add(record)
            db.commit()
            return record.id

    def seed_holiday(self, holiday_date, holiday_name="Test Holiday"):
        with self.TestSession() as db:
            record = Holiday(
                holiday_name=holiday_name, holiday_date=holiday_date
            )
            db.add(record)
            db.commit()
            return record.id

    def entries_on(self, data, target_date):
        return [
            entry
            for entry in data["entries"]
            if entry["roster_date"] == target_date.isoformat()
        ]

    def coverage_on(self, data, target_date):
        return [
            row
            for row in data["coverage"]
            if row["roster_date"] == target_date.isoformat()
        ]

    def uncovered_on(self, data, target_date):
        return [
            row
            for row in data["uncovered"]
            if row["roster_date"] == target_date.isoformat()
        ]

    def standard_setup(self, employee_ids, start_date, end_date, required_count):
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        for employee_id in employee_ids:
            self.seed_assignment(employee_id, brand, process)
        self.seed_requirement(
            brand, process, start_date, end_date, required_count
        )
        return brand, process

    # ---------- weekly-off tests ----------

    def test_employee_with_sunday_weekly_off(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        monday = sunday + timedelta(days=1)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], sunday, monday, 1)
        self.seed_weekly_off(employee, "Sunday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, sunday), [])
        self.assertEqual(len(self.entries_on(data, monday)), 1)
        sunday_uncovered = self.uncovered_on(data, sunday)
        self.assertEqual(len(sunday_uncovered), 1)
        self.assertIn("weekly off", sunday_uncovered[0]["reason"].lower())
        self.assertEqual(self.coverage_on(data, sunday)[0]["status"], "Weekly Off")
        self.assertEqual(
            self.coverage_on(data, sunday)[0]["weekly_off_employee_ids"], [employee]
        )
        self.assertEqual(data["weekly_offs"][0]["day_of_week"], "Sunday")

    def test_employee_with_monday_weekly_off(self):
        monday = first_weekday(YEAR, MONTH, "Monday")
        tuesday = monday + timedelta(days=1)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], monday, tuesday, 1)
        self.seed_weekly_off(employee, "Monday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, monday), [])
        self.assertEqual(len(self.entries_on(data, tuesday)), 1)
        self.assertIn(
            "weekly off", self.uncovered_on(data, monday)[0]["reason"].lower()
        )
        self.assertEqual(self.coverage_on(data, monday)[0]["status"], "Weekly Off")

    def test_different_weekly_offs_for_multiple_employees(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        monday = sunday + timedelta(days=1)
        tuesday = monday + timedelta(days=1)
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        self.standard_setup([employee_one, employee_two], sunday, tuesday, 1)
        self.seed_weekly_off(employee_one, "Sunday")
        self.seed_weekly_off(employee_two, "Monday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, sunday)],
            [employee_two],
        )
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, monday)],
            [employee_one],
        )
        self.assertEqual(len(self.entries_on(data, tuesday)), 1)
        self.assertEqual(len(data["weekly_offs"]), 2)

        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date)
            ).all()
            self.assertEqual(len(rows), len(set(rows)))

    def test_staffing_coverage_after_weekly_off_exclusions(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        self.standard_setup([employee_one, employee_two], sunday, sunday, 2)
        self.seed_weekly_off(employee_one, "Sunday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(len(self.uncovered_on(data, sunday)), 1)
        uncovered = self.uncovered_on(data, sunday)[0]
        self.assertEqual(uncovered["assigned_count"], 1)
        self.assertEqual(uncovered["shortage"], 1)
        self.assertIn("1 on weekly off", uncovered["reason"])
        row = self.coverage_on(data, sunday)[0]
        self.assertEqual(row["required_count"], 2)
        self.assertEqual(row["scheduled_count"], 1)
        self.assertEqual(row["uncovered_count"], 1)
        self.assertEqual(row["status"], "Weekly Off")

    def test_insufficient_available_employees_after_weekly_off(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], sunday, sunday, 2)
        self.seed_weekly_off(employee, "Sunday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 0)
        uncovered = self.uncovered_on(data, sunday)[0]
        self.assertEqual(uncovered["shortage"], 2)
        self.assertIn("1 on weekly off", uncovered["reason"])

    def test_employee_with_no_weekly_off_configuration(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], sunday, sunday, 1)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(len(self.entries_on(data, sunday)), 1)
        self.assertEqual(data["uncovered_count"], 0)
        self.assertEqual(self.coverage_on(data, sunday)[0]["status"], "Fully Staffed")
        self.assertEqual(data["weekly_offs"], [])

    def test_weekly_off_day_names_are_case_insensitive(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], sunday, sunday, 1)
        self.seed_weekly_off(employee, "sunday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, sunday), [])
        self.assertEqual(self.uncovered_on(data, sunday)[0]["shortage"], 1)

    # ---------- holiday tests ----------

    def test_no_employee_scheduled_on_organisation_holiday(self):
        holiday_date = first_weekday(YEAR, MONTH, "Friday")
        next_day = holiday_date + timedelta(days=1)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], holiday_date, next_day, 1)
        self.seed_holiday(holiday_date, "Diwali")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, holiday_date), [])
        self.assertEqual(len(self.entries_on(data, next_day)), 1)
        uncovered = self.uncovered_on(data, holiday_date)[0]
        self.assertIn("Diwali", uncovered["reason"])
        self.assertIn("organisation holiday", uncovered["reason"].lower())
        holiday_row = self.coverage_on(data, holiday_date)[0]
        self.assertEqual(holiday_row["status"], "Holiday")
        self.assertEqual(holiday_row["holiday_name"], "Diwali")
        self.assertEqual(data["holidays"][0]["holiday_name"], "Diwali")

    def test_staffing_coverage_after_holiday_exclusions(self):
        holiday_date = first_weekday(YEAR, MONTH, "Wednesday")
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        self.standard_setup([employee_one, employee_two], holiday_date, holiday_date, 2)
        self.seed_holiday(holiday_date, "Company Day")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 0)
        uncovered = self.uncovered_on(data, holiday_date)[0]
        self.assertEqual(uncovered["assigned_count"], 0)
        self.assertEqual(uncovered["shortage"], 2)
        self.assertIn("Company Day", uncovered["reason"])
        row = self.coverage_on(data, holiday_date)[0]
        self.assertEqual(row["required_count"], 2)
        self.assertEqual(row["scheduled_count"], 0)
        self.assertEqual(row["uncovered_count"], 2)
        self.assertEqual(row["status"], "Holiday")

    def test_holidays_outside_month_are_ignored(self):
        target_date = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target_date, target_date, 1)
        self.seed_holiday(date(YEAR, 11, 10), "Other Month Holiday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(len(self.entries_on(data, target_date)), 1)
        self.assertEqual(data["holidays"], [])

    def test_holiday_takes_priority_over_weekly_off(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], sunday, sunday, 1)
        self.seed_weekly_off(employee, "Sunday")
        self.seed_holiday(sunday, "Sunday Holiday")

        status, data = self.generate()

        self.assertEqual(status, 201)
        reason = self.uncovered_on(data, sunday)[0]["reason"]
        self.assertIn("Sunday Holiday", reason)
        self.assertNotIn("weekly off", reason.lower())
        self.assertEqual(self.coverage_on(data, sunday)[0]["status"], "Holiday")

    # ---------- combined / regression tests ----------

    def test_multiple_requirements_on_same_date(self):
        target_date = date(YEAR, MONTH, 10)
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        brand_one = self.seed_brand("Brand One")
        brand_two = self.seed_brand("Brand Two")
        process_one = self.seed_process("Process One")
        process_two = self.seed_process("Process Two")
        for employee_id in (employee_one, employee_two):
            self.seed_assignment(employee_id, brand_one, process_one)
            self.seed_assignment(employee_id, brand_two, process_two)
        self.seed_requirement(
            brand_one, process_one, target_date, target_date, 1
        )
        self.seed_requirement(
            brand_two, process_two, target_date, target_date, 1
        )
        self.seed_weekly_off(employee_two, calendar.day_name[target_date.weekday()])

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["total_required_staff"], 2)
        self.assertEqual(len(self.entries_on(data, target_date)), 1)
        uncovered = self.uncovered_on(data, target_date)
        self.assertEqual(len(uncovered), 1)
        self.assertIn("already assigned on this date", uncovered[0]["reason"])
        self.assertIn("weekly off", uncovered[0]["reason"].lower())
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date)
            ).all()
            self.assertEqual(len(rows), len(set(rows)))

    def test_regeneration_replaces_entries_without_duplicates(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        self.standard_setup([employee_one, employee_two], sunday, sunday, 1)

        first_status, first_data = self.generate()
        self.assertEqual(first_status, 201)
        self.assertEqual(
            self.entries_on(first_data, sunday)[0]["employee_id"], employee_one
        )

        self.seed_weekly_off(employee_one, "Sunday")
        second_status, second_data = self.generate(regenerate=True)

        self.assertEqual(second_status, 200)
        self.assertEqual(second_data["roster_id"], first_data["roster_id"])
        self.assertEqual(len(self.entries_on(second_data, sunday)), 1)
        self.assertEqual(
            self.entries_on(second_data, sunday)[0]["employee_id"], employee_two
        )
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date)
            ).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(len(db.execute(select(Roster)).scalars().all()), 1)

    def test_regeneration_preserves_other_months(self):
        december_day = date(YEAR, MONTH, 10)
        november_day = date(YEAR, 11, 10)
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, december_day, december_day, 1
        )
        self.seed_requirement(
            brand, process, november_day, november_day, 1
        )

        self.generate(month=12)
        november_status, november_data = self.generate(month=11)
        self.assertEqual(november_status, 201)
        november_roster_id = november_data["roster_id"]

        self.generate(month=12, regenerate=True)

        status, data = self.request("GET", "/api/rosters/2026/11")
        self.assertEqual(status, 200)
        self.assertEqual(data["roster_id"], november_roster_id)
        self.assertEqual(data["total_entries"], 1)

    def test_step20_inactive_brand_process_reporting_still_works(self):
        target_date = date(YEAR, MONTH, 10)
        self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Inactive Brand", active=False)
        process = self.seed_process("Inactive Process", active=False)
        self.seed_requirement(brand, process, target_date, target_date, 2)

        status, data = self.generate()

        self.assertEqual(status, 201)
        uncovered = self.uncovered_on(data, target_date)[0]
        self.assertIn("Unavailable:", uncovered["reason"])
        self.assertIn(f"Brand #{brand} is inactive", uncovered["reason"])
        self.assertIn(f"Process #{process} is inactive", uncovered["reason"])
        self.assertEqual(self.coverage_on(data, target_date)[0]["uncovered_count"], 2)

    def test_step20_duplicate_generation_and_missing_requirements(self):
        target_date = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target_date, target_date, 1)

        first_status, _ = self.generate()
        duplicate_status, duplicate_data = self.generate()
        self.assertEqual(first_status, 201)
        self.assertEqual(duplicate_status, 409)
        self.assertIn("already exists", duplicate_data["detail"])

        missing_status, missing_data = self.generate(month=11)
        self.assertEqual(missing_status, 422)
        self.assertIn("No staffing requirements", missing_data["detail"])


if __name__ == "__main__":
    unittest.main()
