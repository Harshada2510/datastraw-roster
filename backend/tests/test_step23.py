"""Automated tests for Step 23 (Conflict Detection & Roster Validation).

Uses an isolated in-memory SQLite database through a get_db dependency override.
No MySQL connection is made and no production records are read or changed.

The production model keeps its unique (roster, employee, date) constraint. Only
this test fixture temporarily removes that constraint from SQLAlchemy metadata
before creating the SQLite schema so a corrupt duplicate-entry roster can be
represented. The constraint is restored immediately after schema creation.
"""

import asyncio
import calendar
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
    Holiday,
    Leave,
    Process,
    Roster,
    RosterEntry,
    StaffingRequirement,
    WeeklyOff,
)
from app.services.roster_validator import (
    APPROVED_LEAVE,
    DUPLICATE_EMPLOYEE_ASSIGNMENT,
    INACTIVE_BRAND,
    INACTIVE_EMPLOYEE,
    INACTIVE_PROCESS,
    INVALID_ASSIGNMENT,
    ORGANISATION_HOLIDAY,
    WEEKLY_OFF,
)

YEAR = 2026
MONTH = 12
TARGET = date(YEAR, MONTH, 10)

_DUPLICATE_CONSTRAINT = next(
    constraint
    for constraint in RosterEntry.__table__.constraints
    if getattr(constraint, "name", None) == "uq_roster_employee_date"
)


class Step23RosterValidationTests(unittest.TestCase):
    """End-to-end validation API tests with isolated seed data."""

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
        constraints = RosterEntry.__table__.constraints
        constraints.discard(_DUPLICATE_CONSTRAINT)
        try:
            # In-memory SQLite only; production data is never dropped or reset.
            Base.metadata.drop_all(self.test_engine)
            Base.metadata.create_all(self.test_engine)
        finally:
            constraints.add(_DUPLICATE_CONSTRAINT)

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

    def validate(self, year=YEAR, month=MONTH):
        return self.request("POST", f"/api/rosters/{year}/{month}/validate")

    def generate(self):
        return self.request(
            "POST", "/api/rosters/generate", body={"month": MONTH, "year": YEAR}
        )

    # ---------- seed helpers ----------

    def seed_employee(self, code, name, *, active=True):
        with self.TestSession() as db:
            record = Employee(
                employee_code=code, full_name=name, is_active=active
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record.id

    def seed_brand(self, name, *, active=True):
        with self.TestSession() as db:
            record = Brand(brand_name=name, is_active=active)
            db.add(record)
            db.commit()
            db.refresh(record)
            return record.id

    def seed_process(self, name, *, active=True):
        with self.TestSession() as db:
            record = Process(process_name=name, is_active=active)
            db.add(record)
            db.commit()
            db.refresh(record)
            return record.id

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
            record = StaffingRequirement(
                brand_id=brand_id,
                process_id=process_id,
                start_date=start_date,
                end_date=end_date,
                required_count=required_count,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record.id

    def seed_leave(
        self,
        employee_id,
        start_date,
        end_date,
        *,
        status="Approved",
        leave_type="Casual Leave",
    ):
        with self.TestSession() as db:
            record = Leave(
                employee_id=employee_id,
                start_date=start_date,
                end_date=end_date,
                leave_type=leave_type,
                reason="Step 23 test",
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

    def seed_roster(self):
        with self.TestSession() as db:
            roster = Roster(
                year=YEAR,
                month=MONTH,
                days_in_month=31,
                eligible_employees=1,
                total_requirements=1,
                total_required_staff=1,
                total_entries=1,
                total_employees=1,
                uncovered_count=0,
                uncovered_json="[]",
                planning_json="{}",
            )
            db.add(roster)
            db.commit()
            db.refresh(roster)
            return roster.id

    def seed_entry(
        self, roster_id, employee_id, brand_id, process_id, roster_date=TARGET
    ):
        with self.TestSession() as db:
            entry = RosterEntry(
                roster_id=roster_id,
                employee_id=employee_id,
                brand_id=brand_id,
                process_id=process_id,
                roster_date=roster_date,
                shift_details=None,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            return entry.id

    def seed_valid_scenario(self):
        """Create one active assignment, requirement and matching roster entry."""
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        entry_id = self.seed_entry(roster_id, employee, brand, process, TARGET)
        return {
            "employee": employee,
            "brand": brand,
            "process": process,
            "roster": roster_id,
            "entry": entry_id,
        }

    # ---------- assertion helpers ----------

    def conflict_types(self, data):
        return [item["conflict_type"] for item in data["conflicts"]]

    def count_type(self, data, conflict_type):
        return data["conflict_counts"][conflict_type]

    def entries_on(self, data, target_date):
        return [
            entry
            for entry in data["entries"]
            if entry["roster_date"] == target_date.isoformat()
        ]

    def snapshot_entries(self):
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry).order_by(RosterEntry.id)
            ).scalars().all()
            return [
                (
                    row.id,
                    row.roster_id,
                    row.employee_id,
                    row.brand_id,
                    row.process_id,
                    row.roster_date,
                    row.shift_details,
                    row.created_at,
                )
                for row in rows
            ]

    # ---------- Step 23 tests (one per requested scenario) ----------

    def test_01_valid_roster_returns_no_conflicts(self):
        self.seed_valid_scenario()

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(data["year"], YEAR)
        self.assertEqual(data["month"], MONTH)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(data["total_conflicts"], 0)
        self.assertTrue(all(count == 0 for count in data["conflict_counts"].values()))
        self.assertEqual(data["conflicts"], [])
        self.assertEqual(data["staffing_shortages"], [])
        self.assertEqual(data["staffing_coverage"][0]["status"], "Fully Staffed")
        self.assertEqual(data["overall_status"], "Valid")
        self.assertIn("validated_at", data)

    def test_02_duplicate_employee_assignment_is_detected(self):
        employee = self.seed_employee("E1", "Employee One")
        brand_a = self.seed_brand("Brand A")
        brand_b = self.seed_brand("Brand B")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand_a, process)
        self.seed_assignment(employee, brand_b, process)
        self.seed_requirement(brand_a, process, TARGET, TARGET, 1)
        self.seed_requirement(brand_b, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand_a, process, TARGET)
        self.seed_entry(roster_id, employee, brand_b, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(
            self.count_type(data, DUPLICATE_EMPLOYEE_ASSIGNMENT), 2
        )
        self.assertEqual(
            set(self.conflict_types(data)), {DUPLICATE_EMPLOYEE_ASSIGNMENT}
        )
        for conflict in data["conflicts"]:
            self.assertEqual(conflict["roster_date"], TARGET.isoformat())
            self.assertEqual(conflict["employee_id"], employee)
            self.assertIn("more than once", conflict["message"])

    def test_03_approved_leave_conflict_is_detected(self):
        scenario = self.seed_valid_scenario()
        self.seed_leave(scenario["employee"], TARGET, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, APPROVED_LEAVE), 1)
        self.assertEqual(data["conflicts"][0]["employee_name"], "Employee One")
        self.assertEqual(data["conflicts"][0]["roster_date"], TARGET.isoformat())
        self.assertEqual(data["conflicts"][0]["leave_type"], "Casual Leave")

    def test_04_pending_leave_does_not_create_a_conflict(self):
        scenario = self.seed_valid_scenario()
        self.seed_leave(
            scenario["employee"], TARGET, TARGET, status="Pending"
        )

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, APPROVED_LEAVE), 0)
        self.assertEqual(data["total_conflicts"], 0)
        self.assertEqual(data["overall_status"], "Valid")

    def test_05_rejected_leave_does_not_create_a_conflict(self):
        scenario = self.seed_valid_scenario()
        self.seed_leave(
            scenario["employee"], TARGET, TARGET, status="Rejected"
        )

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, APPROVED_LEAVE), 0)
        self.assertEqual(data["total_conflicts"], 0)
        self.assertEqual(data["overall_status"], "Valid")

    def test_06_weekly_off_conflict_is_detected(self):
        scenario = self.seed_valid_scenario()
        weekday = calendar.day_name[TARGET.weekday()]
        self.seed_weekly_off(scenario["employee"], weekday)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, WEEKLY_OFF), 1)
        self.assertEqual(data["conflicts"][0]["weekly_off_day"], weekday)
        self.assertIn(weekday, data["conflicts"][0]["message"])

    def test_07_organisation_holiday_conflict_is_detected(self):
        self.seed_valid_scenario()
        self.seed_holiday(TARGET, "Republic Day")

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, ORGANISATION_HOLIDAY), 1)
        self.assertEqual(data["conflicts"][0]["holiday_name"], "Republic Day")

    def test_08_invalid_employee_brand_process_assignment_is_detected(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, INVALID_ASSIGNMENT), 1)
        self.assertEqual(data["total_conflicts"], 1)
        self.assertIn("No employee-brand-process assignment", data["conflicts"][0]["message"])

    def test_09_inactive_employee_conflict_is_detected(self):
        employee = self.seed_employee(
            "E1", "Employee One", active=False
        )
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, INACTIVE_EMPLOYEE), 1)
        self.assertEqual(self.count_type(data, INVALID_ASSIGNMENT), 0)

    def test_10_inactive_brand_conflict_is_detected(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One", active=False)
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, INACTIVE_BRAND), 1)
        self.assertEqual(self.count_type(data, INACTIVE_PROCESS), 0)

    def test_11_inactive_process_conflict_is_detected(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One", active=False)
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(self.count_type(data, INACTIVE_PROCESS), 1)
        self.assertEqual(self.count_type(data, INACTIVE_BRAND), 0)

    def test_12_understaffed_requirements_are_reported(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 3)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee, brand, process, TARGET)

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(data["total_conflicts"], 0)
        self.assertEqual(data["total_shortages"], 1)
        self.assertEqual(len(data["staffing_shortages"]), 1)
        shortage = data["staffing_shortages"][0]
        self.assertEqual(shortage["required_count"], 3)
        self.assertEqual(shortage["scheduled_count"], 1)
        self.assertEqual(shortage["uncovered_count"], 2)
        self.assertEqual(data["overall_status"], "Shortages")

    def test_13_fully_staffed_requirements_are_reported_correctly(self):
        self.seed_valid_scenario()

        status, data = self.validate()

        self.assertEqual(status, 200)
        coverage = data["staffing_coverage"][0]
        self.assertEqual(coverage["status"], "Fully Staffed")
        self.assertEqual(coverage["required_count"], 1)
        self.assertEqual(coverage["scheduled_count"], 1)
        self.assertEqual(coverage["uncovered_count"], 0)
        self.assertEqual(data["staffing_shortages"], [])
        self.assertEqual(data["overall_status"], "Valid")

    def test_14_multiple_conflicts_on_the_same_date_are_detected(self):
        scenario = self.seed_valid_scenario()
        self.seed_leave(scenario["employee"], TARGET, TARGET)
        self.seed_weekly_off(
            scenario["employee"], calendar.day_name[TARGET.weekday()]
        )
        self.seed_holiday(TARGET, "Republic Day")

        status, data = self.validate()

        self.assertEqual(status, 200)
        self.assertEqual(
            set(self.conflict_types(data)),
            {APPROVED_LEAVE, WEEKLY_OFF, ORGANISATION_HOLIDAY},
        )
        self.assertEqual(data["total_conflicts"], 3)
        self.assertTrue(
            all(
                conflict["roster_date"] == TARGET.isoformat()
                for conflict in data["conflicts"]
            )
        )

    def test_15_validation_does_not_modify_roster_entries(self):
        self.seed_valid_scenario()
        before = self.snapshot_entries()

        status, data = self.validate()

        after = self.snapshot_entries()
        self.assertEqual(status, 200)
        self.assertEqual(data["total_entries"], 1)
        self.assertEqual(before, after)

    def test_16_validation_of_a_missing_roster_returns_404(self):
        status, data = self.validate()

        self.assertEqual(status, 404)
        self.assertEqual(
            data["detail"], "No roster has been generated for this month."
        )

    def test_17_existing_step_20_21_22_functionality_remains_intact(self):
        leave_employee = self.seed_employee("E1", "Employee On Leave")
        weekly_off_employee = self.seed_employee("E2", "Employee On Weekly Off")
        available_employee = self.seed_employee("E3", "Available Employee")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        for employee_id in (
            leave_employee,
            weekly_off_employee,
            available_employee,
        ):
            self.seed_assignment(employee_id, brand, process)
        self.seed_requirement(brand, process, TARGET, TARGET, 1)
        self.seed_leave(leave_employee, TARGET, TARGET, status="Approved")
        self.seed_weekly_off(
            weekly_off_employee, calendar.day_name[TARGET.weekday()]
        )

        generate_status, generated = self.generate()
        self.assertEqual(generate_status, 201)
        self.assertEqual(
            [item["employee_id"] for item in self.entries_on(generated, TARGET)],
            [available_employee],
        )
        self.assertEqual(len(generated["approved_leaves"]), 1)
        self.assertEqual(len(generated["weekly_offs"]), 1)
        self.assertEqual(len(generated["coverage"]), 1)
        self.assertEqual(generated["uncovered_count"], 0)

        validate_status, report = self.validate()
        self.assertEqual(validate_status, 200)
        self.assertEqual(report["total_conflicts"], 0)
        self.assertEqual(report["staffing_shortages"], [])
        self.assertEqual(report["overall_status"], "Valid")


if __name__ == "__main__":
    unittest.main()
