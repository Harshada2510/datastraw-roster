"""Automated tests for Step 22 (Approved Leave Handling).

Uses an isolated in-memory SQLite database via a get_db dependency override.
No MySQL connection is made and no production employee or leave data is touched.
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
    Leave,
    Process,
    Roster,
    RosterEntry,
    StaffingRequirement,
    WeeklyOff,
)

YEAR = 2026
MONTH = 12
APPROVED_LEAVE_REASON = "Insufficient available employees due to approved leave."


def first_weekday(year, month, weekday_name):
    """First date of a given weekday name inside a month."""
    target = list(calendar.day_name).index(weekday_name)
    current = date(year, month, 1)
    while current.weekday() != target:
        current += timedelta(days=1)
    return current


class Step22ApprovedLeaveTests(unittest.TestCase):
    """End-to-end roster API tests covering approved leave exclusions."""

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

    def seed_leave(
        self,
        employee_id,
        start_date,
        end_date,
        *,
        status="Approved",
        leave_type="Casual Leave",
    ):
        """Seed directly into the existing leaves table (no leave API writes)."""
        with self.TestSession() as db:
            record = Leave(
                employee_id=employee_id,
                start_date=start_date,
                end_date=end_date,
                leave_type=leave_type,
                reason="Step 22 test",
                status=status,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record.id

    def seed_weekly_off(self, employee_id, day_of_week):
        with self.TestSession() as db:
            db.add(WeeklyOff(employee_id=employee_id, day_of_week=day_of_week))
            db.commit()

    def seed_holiday(self, holiday_date, holiday_name="Test Holiday"):
        with self.TestSession() as db:
            db.add(
                Holiday(holiday_name=holiday_name, holiday_date=holiday_date)
            )
            db.commit()

    def standard_setup(self, employee_ids, start_date, end_date, required_count):
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        for employee_id in employee_ids:
            self.seed_assignment(employee_id, brand, process)
        self.seed_requirement(brand, process, start_date, end_date, required_count)
        return brand, process

    # ---------- assertion helpers ----------

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

    def assert_leave_ids(self, data, target_date, expected_ids):
        rows = self.coverage_on(data, target_date)
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(row["leave_employee_ids"], expected_ids)

    # ---------- Step 22 tests (one per requested scenario) ----------

    def test_01_employee_with_approved_leave_is_not_assigned(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 1)
        self.seed_leave(employee, target, target)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, target), [])
        uncovered = self.uncovered_on(data, target)[0]
        self.assertIn(APPROVED_LEAVE_REASON, uncovered["reason"])
        self.assert_leave_ids(data, target, [employee])
        self.assertEqual(len(data["approved_leaves"]), 1)

    def test_02_employee_with_pending_leave_can_be_assigned(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 1)
        self.seed_leave(employee, target, target, status="Pending")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, target)],
            [employee],
        )
        self.assertEqual(data["approved_leaves"], [])
        self.assertEqual(data["uncovered_count"], 0)
        self.assert_leave_ids(data, target, [])

    def test_03_employee_with_rejected_leave_can_be_assigned(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 1)
        self.seed_leave(employee, target, target, status="Rejected")

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, target)],
            [employee],
        )
        self.assertEqual(data["approved_leaves"], [])
        self.assertEqual(data["uncovered_count"], 0)
        self.assert_leave_ids(data, target, [])

    def test_04_employee_available_before_approved_leave_starts(self):
        before = date(YEAR, MONTH, 9)
        leave_start = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], before, leave_start, 1)
        self.seed_leave(employee, leave_start, date(YEAR, MONTH, 12))

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(len(self.entries_on(data, before)), 1)
        self.assertEqual(self.entries_on(data, leave_start), [])

    def test_05_employee_available_after_approved_leave_ends(self):
        leave_end = date(YEAR, MONTH, 9)
        after = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], leave_end, after, 1)
        self.seed_leave(employee, date(YEAR, MONTH, 8), leave_end)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, leave_end), [])
        self.assertEqual(len(self.entries_on(data, after)), 1)

    def test_06_approved_leave_covering_entire_month_excludes_employee(self):
        first = date(YEAR, MONTH, 1)
        last = date(YEAR, MONTH, 31)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], first, last, 1)
        self.seed_leave(employee, first, last)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["entries"], [])
        self.assertEqual(data["uncovered_count"], 31)
        self.assertEqual(len(data["approved_leaves"]), 1)
        self.assertTrue(
            all(row["leave_employee_ids"] == [employee] for row in data["coverage"])
        )

    def test_07_approved_leave_starting_before_selected_month(self):
        excluded_day = date(YEAR, MONTH, 5)
        available_day = date(YEAR, MONTH, 6)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], excluded_day, available_day, 1)
        self.seed_leave(employee, date(YEAR, 11, 20), excluded_day)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, excluded_day), [])
        self.assertEqual(len(self.entries_on(data, available_day)), 1)
        self.assertEqual(data["approved_leaves"][0]["end_date"], excluded_day.isoformat())

    def test_08_approved_leave_ending_after_selected_month(self):
        available_day = date(YEAR, MONTH, 26)
        excluded_day = date(YEAR, MONTH, 27)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], available_day, excluded_day, 1)
        self.seed_leave(employee, excluded_day, date(YEAR + 1, 1, 10))

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(len(self.entries_on(data, available_day)), 1)
        self.assertEqual(self.entries_on(data, excluded_day), [])
        self.assertEqual(data["approved_leaves"][0]["start_date"], excluded_day.isoformat())

    def test_09_approved_leave_outside_selected_month_is_ignored(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 1)
        self.seed_leave(employee, date(YEAR, 11, 1), date(YEAR, 11, 30))

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(len(self.entries_on(data, target)), 1)
        self.assertEqual(data["approved_leaves"], [])
        self.assertEqual(data["uncovered_count"], 0)

    def test_10_multiple_approved_leaves_for_same_employee(self):
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup(
            [employee], date(YEAR, MONTH, 5), date(YEAR, MONTH, 10), 1
        )
        self.seed_leave(employee, date(YEAR, MONTH, 5), date(YEAR, MONTH, 6))
        self.seed_leave(employee, date(YEAR, MONTH, 9), date(YEAR, MONTH, 10))

        status, data = self.generate()

        self.assertEqual(status, 201)
        scheduled_days = sorted(
            date.fromisoformat(entry["roster_date"])
            for entry in data["entries"]
        )
        self.assertEqual(
            scheduled_days,
            [date(YEAR, MONTH, 7), date(YEAR, MONTH, 8)],
        )
        self.assertEqual(len(data["approved_leaves"]), 2)

    def test_11_employee_with_no_leave_records_remains_eligible(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 1)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, target)],
            [employee],
        )
        self.assertEqual(data["approved_leaves"], [])

    def test_12_other_employees_fill_coverage_when_one_is_on_leave(self):
        target = date(YEAR, MONTH, 10)
        on_leave = self.seed_employee("E1", "Employee On Leave")
        available = self.seed_employee("E2", "Employee Available")
        self.standard_setup([on_leave, available], target, target, 1)
        self.seed_leave(on_leave, target, target)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, target)],
            [available],
        )
        self.assert_leave_ids(data, target, [on_leave])
        self.assertEqual(data["uncovered_count"], 0)

    def test_13_insufficient_staff_due_to_approved_leave_is_uncovered(self):
        target = date(YEAR, MONTH, 10)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], target, target, 2)
        self.seed_leave(employee, target, target)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["total_entries"], 0)
        uncovered = self.uncovered_on(data, target)[0]
        self.assertEqual(uncovered["assigned_count"], 0)
        self.assertEqual(uncovered["shortage"], 2)
        self.assertIn(APPROVED_LEAVE_REASON, uncovered["reason"])
        self.assertIn("1 on approved leave", uncovered["reason"])
        self.assertEqual(self.coverage_on(data, target)[0]["status"], "Understaffed")

    def test_14_weekly_off_exclusions_continue_working(self):
        sunday = first_weekday(YEAR, MONTH, "Sunday")
        weekly_off_employee = self.seed_employee("E1", "Weekly Off Employee")
        leave_employee = self.seed_employee("E2", "Leave Employee")
        self.standard_setup(
            [weekly_off_employee, leave_employee], sunday, sunday, 1
        )
        self.seed_weekly_off(weekly_off_employee, "Sunday")
        self.seed_leave(leave_employee, sunday, sunday)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, sunday), [])
        row = self.coverage_on(data, sunday)[0]
        self.assertEqual(row["status"], "Weekly Off")
        self.assertEqual(row["weekly_off_employee_ids"], [weekly_off_employee])
        self.assertEqual(row["leave_employee_ids"], [leave_employee])
        reason = self.uncovered_on(data, sunday)[0]["reason"].lower()
        self.assertIn("weekly off", reason)
        self.assertIn("approved leave", reason)

    def test_15_organisation_holiday_exclusions_continue_working(self):
        friday = first_weekday(YEAR, MONTH, "Friday")
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], friday, friday, 1)
        self.seed_holiday(friday, "Company Day")
        self.seed_leave(employee, friday, friday)

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(self.entries_on(data, friday), [])
        row = self.coverage_on(data, friday)[0]
        self.assertEqual(row["status"], "Holiday")
        self.assertEqual(row["holiday_name"], "Company Day")
        reason = self.uncovered_on(data, friday)[0]["reason"]
        self.assertIn("Company Day", reason)
        self.assertEqual(len(data["approved_leaves"]), 1)

    def test_16_regeneration_respects_updated_approved_leave_records(self):
        first_day = date(YEAR, MONTH, 10)
        second_day = date(YEAR, MONTH, 11)
        employee = self.seed_employee("E1", "Employee One")
        self.standard_setup([employee], first_day, second_day, 1)
        leave_id = self.seed_leave(employee, first_day, second_day)

        first_status, first_data = self.generate()
        self.assertEqual(first_status, 201)
        self.assertEqual(self.entries_on(first_data, first_day), [])
        self.assertEqual(self.entries_on(first_data, second_day), [])

        with self.TestSession() as db:
            record = db.get(Leave, leave_id)
            record.start_date = date(YEAR, MONTH, 12)
            record.end_date = date(YEAR, MONTH, 13)
            db.commit()

        second_status, second_data = self.generate(regenerate=True)

        self.assertEqual(second_status, 200)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(second_data, first_day)],
            [employee],
        )
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(second_data, second_day)],
            [employee],
        )
        self.assertEqual(
            second_data["approved_leaves"][0]["start_date"],
            date(YEAR, MONTH, 12).isoformat(),
        )

    def test_17_regeneration_does_not_create_duplicate_entries(self):
        target = date(YEAR, MONTH, 10)
        on_leave = self.seed_employee("E1", "Employee On Leave")
        available = self.seed_employee("E2", "Employee Available")
        self.standard_setup([on_leave, available], target, target, 1)
        self.seed_leave(on_leave, target, target)

        first_status, first_data = self.generate()
        second_status, second_data = self.generate(regenerate=True)

        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 200)
        self.assertEqual(second_data["roster_id"], first_data["roster_id"])
        self.assertEqual(second_data["total_entries"], 1)
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(second_data, target)],
            [available],
        )
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date)
            ).all()
            self.assertEqual(len(rows), len(set(rows)))
            self.assertEqual(len(db.execute(select(Roster)).scalars().all()), 1)

    def test_18_existing_step20_and_step21_functionality_unchanged(self):
        weekly_off_day = first_weekday(YEAR, MONTH, "Sunday")
        holiday_day = first_weekday(YEAR, MONTH, "Friday")
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")

        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        for employee_id in (employee_one, employee_two):
            self.seed_assignment(employee_id, brand, process)
        self.seed_requirement(brand, process, weekly_off_day, weekly_off_day, 2)
        self.seed_requirement(brand, process, holiday_day, holiday_day, 1)
        self.seed_weekly_off(employee_one, "Sunday")
        self.seed_holiday(holiday_day, "Existing Holiday")

        inactive_brand = self.seed_brand("Inactive Brand", active=False)
        inactive_process = self.seed_process("Inactive Process", active=False)
        self.seed_requirement(
            inactive_brand, inactive_process, weekly_off_day, weekly_off_day, 1
        )

        status, data = self.generate()

        self.assertEqual(status, 201)
        self.assertEqual(data["approved_leaves"], [])
        self.assertEqual(
            [entry["employee_id"] for entry in self.entries_on(data, weekly_off_day)],
            [employee_two],
        )
        weekly_off_row = next(
            row
            for row in self.coverage_on(data, weekly_off_day)
            if row["brand_id"] == brand and row["process_id"] == process
        )
        self.assertEqual(weekly_off_row["status"], "Weekly Off")
        self.assertIn("1 on weekly off", weekly_off_row["reason"])
        self.assertEqual(
            self.coverage_on(data, holiday_day)[0]["status"], "Holiday"
        )
        inactive_reason = next(
            row["reason"]
            for row in self.uncovered_on(data, weekly_off_day)
            if row["brand_id"] == inactive_brand
            and row["process_id"] == inactive_process
        )
        self.assertIn("Unavailable:", inactive_reason)
        self.assertIn(f"Brand #{inactive_brand} is inactive", inactive_reason)
        self.assertIn(f"Process #{inactive_process} is inactive", inactive_reason)


if __name__ == "__main__":
    unittest.main()
