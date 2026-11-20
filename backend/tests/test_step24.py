"""Automated tests for Step 24 (Roster Editing, Regeneration & Views).

Uses an isolated in-memory SQLite database through a get_db dependency override.
No MySQL connection is made and no production records are read or changed.
Every test recreates the schema in that in-memory database only.

Covers: all nine edit validation rules, transactional edits, safe regeneration,
monthly/weekly/employee-wise views, combined filters and filter clearing, plus
a regression check for the existing Step 20-23 APIs.
"""

import asyncio
import calendar
import json
import unittest
from datetime import date
from unittest.mock import patch

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
TARGET = date(YEAR, MONTH, 10)
SECOND_DATE = date(YEAR, MONTH, 11)
NOVEMBER_DATE = date(YEAR, 11, 10)


class Step24RosterEditingAndViewTests(unittest.TestCase):
    """End-to-end Step 24 API tests with isolated seed data."""

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
        payload = json.dumps(body, default=str).encode() if body is not None else b""
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
                reason="Step 24 test",
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
            db.add(Holiday(holiday_name=holiday_name, holiday_date=holiday_date))
            db.commit()

    def seed_roster(self, year=YEAR, month=MONTH):
        with self.TestSession() as db:
            roster = Roster(
                year=year,
                month=month,
                days_in_month=calendar.monthrange(year, month)[1],
                eligible_employees=2,
                total_requirements=1,
                total_required_staff=1,
                total_entries=0,
                total_employees=0,
                uncovered_count=0,
                uncovered_json="[]",
                planning_json="{}",
            )
            db.add(roster)
            db.commit()
            db.refresh(roster)
            return roster.id

    def seed_entry(
        self,
        roster_id,
        employee_id,
        brand_id,
        process_id,
        roster_date=TARGET,
        shift_details=None,
    ):
        with self.TestSession() as db:
            entry = RosterEntry(
                roster_id=roster_id,
                employee_id=employee_id,
                brand_id=brand_id,
                process_id=process_id,
                roster_date=roster_date,
                shift_details=shift_details,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            return entry.id

    def seed_valid_scenario(self):
        """One active assignment, requirement, roster and roster entry."""
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

    # ---------- API helpers ----------

    def edit(self, entry_id, **fields):
        return self.request(
            "PUT", f"/api/rosters/entries/{entry_id}", body=fields
        )

    def month_entries(self, year=YEAR, month=MONTH, **params):
        query = "&".join(f"{key}={value}" for key, value in params.items()).encode()
        return self.request(
            "GET", f"/api/rosters/{year}/{month}/entries", query=query
        )

    def week_view(self, week_start=None, **params):
        params = dict(params)
        if week_start is not None:
            params["week_start"] = week_start
        query = "&".join(f"{key}={value}" for key, value in params.items()).encode()
        return self.request("GET", f"/api/rosters/{YEAR}/{MONTH}/weekly", query=query)

    def employee_view(self, employee_id, **params):
        params = dict(params)
        params["employee_id"] = employee_id
        query = "&".join(f"{key}={value}" for key, value in params.items()).encode()
        return self.request(
            "GET", f"/api/rosters/{YEAR}/{MONTH}/employee-wise", query=query
        )

    def generate(self, month=MONTH, year=YEAR, regenerate=False):
        path = "/api/rosters/regenerate" if regenerate else "/api/rosters/generate"
        return self.request("POST", path, body={"month": month, "year": year})

    def entry_snapshot(self):
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

    def roster_snapshot(self, roster_id):
        with self.TestSession() as db:
            roster = db.get(Roster, roster_id)
            return (
                roster.id,
                roster.total_entries,
                roster.uncovered_count,
                roster.uncovered_json,
                roster.planning_json,
            )

    # ---------- Part 1: roster entry editing ----------

    def test_01_successful_roster_entry_edit(self):
        scenario = self.seed_valid_scenario()

        status, data = self.edit(scenario["entry"], shift_details="09:00-18:00")

        self.assertEqual(status, 200)
        self.assertEqual(data["id"], scenario["entry"])
        self.assertEqual(data["shift_details"], "09:00-18:00")
        self.assertEqual(data["employee_id"], scenario["employee"])
        self.assertEqual(data["brand_id"], scenario["brand"])
        self.assertEqual(data["process_id"], scenario["process"])
        with self.TestSession() as db:
            self.assertEqual(
                db.get(RosterEntry, scenario["entry"]).shift_details,
                "09:00-18:00",
            )

    def test_02_employee_reassignment(self):
        scenario = self.seed_valid_scenario()
        replacement = self.seed_employee("E2", "Employee Two")
        self.seed_assignment(replacement, scenario["brand"], scenario["process"])

        status, data = self.edit(scenario["entry"], employee_id=replacement)

        self.assertEqual(status, 200)
        self.assertEqual(data["employee_id"], replacement)
        self.assertEqual(data["employee_name"], "Employee Two")
        self.assertEqual(data["employee_code"], "E2")

    def test_03_invalid_employee_edit_rejected(self):
        scenario = self.seed_valid_scenario()
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], employee_id=99999)

        self.assertEqual(status, 404)
        self.assertIn("Employee #99999 does not exist", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_04_inactive_employee_edit_rejected(self):
        scenario = self.seed_valid_scenario()
        inactive = self.seed_employee("E9", "Inactive Employee", active=False)
        self.seed_assignment(inactive, scenario["brand"], scenario["process"])
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], employee_id=inactive)

        self.assertEqual(status, 422)
        self.assertIn("inactive", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_05_invalid_brand_edit_rejected(self):
        scenario = self.seed_valid_scenario()
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], brand_id=99999)

        self.assertEqual(status, 404)
        self.assertIn("Brand #99999 does not exist", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_06_invalid_process_edit_rejected(self):
        scenario = self.seed_valid_scenario()
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], process_id=99999)

        self.assertEqual(status, 404)
        self.assertIn("Process #99999 does not exist", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_07_missing_employee_brand_process_assignment_rejected(self):
        scenario = self.seed_valid_scenario()
        other_brand = self.seed_brand("Brand Two")
        other_process = self.seed_process("Process Two")
        before = self.entry_snapshot()

        status, data = self.edit(
            scenario["entry"], brand_id=other_brand, process_id=other_process
        )

        self.assertEqual(status, 422)
        self.assertIn("No employee-brand-process assignment", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_08_duplicate_employee_assignment_rejected(self):
        scenario = self.seed_valid_scenario()
        replacement = self.seed_employee("E2", "Employee Two")
        self.seed_assignment(replacement, scenario["brand"], scenario["process"])
        self.seed_entry(
            scenario["roster"], replacement, scenario["brand"], scenario["process"], TARGET
        )
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], employee_id=replacement)

        self.assertEqual(status, 409)
        self.assertIn("already assigned", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_09_approved_leave_conflict_rejected(self):
        scenario = self.seed_valid_scenario()
        self.seed_leave(scenario["employee"], TARGET, TARGET)
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], shift_details="Night")

        self.assertEqual(status, 409)
        self.assertIn("approved Casual Leave", data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_10_weekly_off_conflict_rejected(self):
        scenario = self.seed_valid_scenario()
        weekday = calendar.day_name[TARGET.weekday()]
        self.seed_weekly_off(scenario["employee"], weekday.lower())
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], shift_details="Night")

        self.assertEqual(status, 409)
        self.assertIn(weekday, data["detail"])
        self.assertEqual(before, self.entry_snapshot())

    def test_11_organisation_holiday_conflict_rejected(self):
        scenario = self.seed_valid_scenario()
        self.seed_holiday(TARGET, "Republic Day")
        before = self.entry_snapshot()

        status, data = self.edit(scenario["entry"], shift_details="Night")

        self.assertEqual(status, 409)
        self.assertIn("organisation holiday", data["detail"].lower())
        self.assertEqual(before, self.entry_snapshot())

    def test_12_missing_roster_entry_returns_404(self):
        status, data = self.edit(99999, shift_details="09:00-18:00")
        self.assertEqual(status, 404)
        self.assertIn("was not found", data["detail"])

        status, data = self.request("GET", "/api/rosters/entries/99999")
        self.assertEqual(status, 404)
        self.assertIn("was not found", data["detail"])

    def test_13_editing_one_entry_does_not_modify_other_entries(self):
        scenario = self.seed_valid_scenario()
        other_id = self.seed_entry(
            scenario["roster"],
            scenario["employee"],
            scenario["brand"],
            scenario["process"],
            SECOND_DATE,
        )
        before = self.entry_snapshot()

        status, _ = self.edit(scenario["entry"], shift_details="Changed")
        self.assertEqual(status, 200)

        after = self.entry_snapshot()
        self.assertEqual(after[0][0], scenario["entry"])
        self.assertEqual(after[0][6], "Changed")
        self.assertEqual(after[1], before[1])
        self.assertEqual(after[1][0], other_id)

    def test_23_edit_rejects_date_outside_roster_month(self):
        scenario = self.seed_valid_scenario()

        status, data = self.edit(scenario["entry"], roster_date=NOVEMBER_DATE)

        self.assertEqual(status, 400)
        self.assertIn("outside", data["detail"])

    def test_24_edit_rejects_wrong_selected_roster(self):
        scenario = self.seed_valid_scenario()
        other_roster = self.seed_roster(YEAR, 11)

        status, data = self.edit(scenario["entry"], roster_id=other_roster)

        self.assertEqual(status, 400)
        self.assertIn("belongs to roster", data["detail"])

    def test_25_brand_and_process_change_with_assignment_succeeds(self):
        scenario = self.seed_valid_scenario()
        brand_two = self.seed_brand("Brand Two")
        process_two = self.seed_process("Process Two")
        self.seed_assignment(scenario["employee"], brand_two, process_two)
        self.seed_requirement(brand_two, process_two, TARGET, TARGET, 1)

        status, data = self.edit(
            scenario["entry"], brand_id=brand_two, process_id=process_two
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["brand_name"], "Brand Two")
        self.assertEqual(data["process_name"], "Process Two")

    def test_26_get_entry_endpoint_returns_entry(self):
        scenario = self.seed_valid_scenario()

        status, data = self.request(
            "GET", f"/api/rosters/entries/{scenario['entry']}"
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["roster_id"], scenario["roster"])
        self.assertEqual(data["employee_id"], scenario["employee"])
        self.assertEqual(data["roster_date"], TARGET.isoformat())

    # ---------- Part 2: safe regeneration ----------

    def test_14_regeneration_preserves_other_months(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(YEAR, 11, 1), date(YEAR, 12, 31), 1
        )

        november_status, november = self.generate(month=11)
        december_status, december = self.generate(month=12)
        self.assertEqual(november_status, 201)
        self.assertEqual(december_status, 201)
        november_before = self.month_entries(month=11)[1]["entries"]

        regenerate_status, regenerated = self.generate(month=12, regenerate=True)
        self.assertEqual(regenerate_status, 200)
        self.assertEqual(regenerated["roster_id"], december["roster_id"])

        november_after = self.month_entries(month=11)[1]["entries"]
        self.assertEqual(november_before, november_after)
        self.assertTrue(november_after)

    def test_15_regeneration_does_not_create_duplicate_entries(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        self.seed_requirement(
            brand, process, date(YEAR, 12, 1), date(YEAR, 12, 31), 1
        )
        first_status, first = self.generate()
        self.assertEqual(first_status, 201)
        roster_id = first["roster_id"]
        edited = next(
            item["id"]
            for item in first["entries"]
            if item["roster_date"] == TARGET.isoformat()
        )
        self.edit(edited, shift_details="Manual edit")

        second_status, second = self.generate(regenerate=True)

        self.assertEqual(second_status, 200)
        self.assertEqual(second["roster_id"], roster_id)
        self.assertEqual(second["total_entries"], 31)
        with self.TestSession() as db:
            rows = db.execute(
                select(RosterEntry.employee_id, RosterEntry.roster_date)
            ).all()
            self.assertEqual(len(rows), 31)
            self.assertEqual(len(rows), len(set(rows)))
            shifts = db.execute(
                select(RosterEntry.shift_details).where(
                    RosterEntry.shift_details.is_not(None)
                )
            ).scalars().all()
            self.assertEqual(shifts, [])  # manual edit explicitly replaced
        self.assertIn("replace", second["message"].lower())

    def test_16_failed_regeneration_rolls_back_safely(self):
        scenario = self.seed_valid_scenario()
        baseline_roster = self.roster_snapshot(scenario["roster"])
        baseline_entries = self.entry_snapshot()

        with patch(
            "app.routes.roster.generate_roster",
            side_effect=RuntimeError("simulated generation failure"),
        ):
            with self.assertRaises(RuntimeError):
                self.generate(regenerate=True)

        self.assertEqual(baseline_entries, self.entry_snapshot())
        with self.TestSession() as db:
            self.assertEqual(
                baseline_roster, self.roster_snapshot(scenario["roster"])
            )
        self.assertEqual(len(self.request("GET", f"/api/rosters/{YEAR}/{MONTH}")[1]["entries"]), 1)

    # ---------- Part 3: views and filters ----------

    def test_17_monthly_view_returns_correct_entries(self):
        scenario = self.seed_valid_scenario()
        other_id = self.seed_entry(
            scenario["roster"],
            scenario["employee"],
            scenario["brand"],
            scenario["process"],
            SECOND_DATE,
            shift_details="Evening",
        )

        status, data = self.month_entries()

        self.assertEqual(status, 200)
        self.assertEqual(data["roster_id"], scenario["roster"])
        self.assertEqual(data["year"], YEAR)
        self.assertEqual(data["month"], MONTH)
        self.assertEqual(data["total_entries"], 2)
        self.assertEqual(data["filtered_count"], 2)
        self.assertEqual(
            [entry["id"] for entry in data["entries"]],
            [scenario["entry"], other_id],
        )
        self.assertEqual(data["entries"][1]["shift_details"], "Evening")

    def test_18_weekly_view_handles_month_boundaries(self):
        employee = self.seed_employee("E1", "Employee One")
        brand = self.seed_brand("Brand One")
        process = self.seed_process("Process One")
        self.seed_assignment(employee, brand, process)
        november_roster = self.seed_roster(YEAR, 11)
        december_roster = self.seed_roster(YEAR, 12)

        self.seed_entry(
            november_roster, employee, brand, process, date(YEAR, 11, 30)
        )
        self.seed_entry(
            december_roster, employee, brand, process, date(YEAR, 12, 1)
        )

        status, data = self.week_view(week_start="2026-11-30")

        self.assertEqual(status, 200)
        self.assertEqual(data["week_start"], "2026-11-30")
        self.assertEqual(data["week_end"], "2026-12-06")
        self.assertEqual(data["previous_week_start"], "2026-11-23")
        self.assertEqual(data["next_week_start"], "2026-12-07")
        self.assertEqual(len(data["days"]), 7)
        self.assertEqual(data["days"][0]["day_name"], "Monday")
        self.assertFalse(data["days"][0]["in_selected_month"])
        self.assertEqual(len(data["days"][0]["entries"]), 1)
        self.assertEqual(data["days"][0]["entries"][0]["roster_id"], november_roster)
        self.assertTrue(data["days"][1]["in_selected_month"])
        self.assertEqual(len(data["days"][1]["entries"]), 1)
        self.assertEqual(data["days"][1]["entries"][0]["roster_id"], december_roster)
        self.assertEqual(data["entry_count"], 2)

        # Default week starts on the Monday of the selected month's first day.
        default_status, default_data = self.week_view()
        self.assertEqual(default_status, 200)
        self.assertEqual(default_data["week_start"], "2026-11-30")

    def test_19_employee_wise_view_returns_correct_assignments(self):
        scenario = self.seed_valid_scenario()
        other_id = self.seed_entry(
            scenario["roster"],
            scenario["employee"],
            scenario["brand"],
            scenario["process"],
            SECOND_DATE,
            shift_details="Evening",
        )
        weekday = calendar.day_name[TARGET.weekday()]
        self.seed_weekly_off(scenario["employee"], weekday)
        self.seed_leave(scenario["employee"], TARGET, SECOND_DATE)

        status, data = self.employee_view(scenario["employee"])

        self.assertEqual(status, 200)
        self.assertEqual(data["employee_code"], "E1")
        self.assertEqual(data["employee_name"], "Employee One")
        self.assertEqual(
            [item["id"] for item in data["assignments"]],
            [scenario["entry"], other_id],
        )
        self.assertEqual(data["assignments"][1]["shift_details"], "Evening")
        self.assertEqual(data["weekly_offs"][0]["day_of_week"], weekday)
        self.assertIn(TARGET.isoformat(), data["weekly_offs"][0]["dates"])
        self.assertEqual(len(data["approved_leaves"]), 1)
        self.assertEqual(data["approved_leaves"][0]["status"], "Approved")
        self.assertEqual(
            data["approved_leaves"][0]["dates"],
            [TARGET.isoformat(), SECOND_DATE.isoformat()],
        )

    def test_20_combined_filters_return_correct_results(self):
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        brand_one = self.seed_brand("Brand One")
        brand_two = self.seed_brand("Brand Two")
        process_one = self.seed_process("Process One")
        process_two = self.seed_process("Process Two")
        for employee in (employee_one, employee_two):
            self.seed_assignment(employee, brand_one, process_one)
            self.seed_assignment(employee, brand_two, process_two)
        roster_id = self.seed_roster()
        matching = self.seed_entry(
            roster_id, employee_one, brand_one, process_one, TARGET
        )
        self.seed_entry(
            roster_id, employee_one, brand_two, process_two, SECOND_DATE
        )
        self.seed_entry(
            roster_id, employee_two, brand_one, process_one, date(YEAR, 12, 20)
        )

        status, data = self.month_entries(
            employee_id=employee_one,
            brand_id=brand_one,
            process_id=process_one,
            start_date=TARGET,
            end_date=SECOND_DATE,
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["total_entries"], 3)
        self.assertEqual(data["filtered_count"], 1)
        self.assertEqual([item["id"] for item in data["entries"]], [matching])
        self.assertEqual(data["filters"]["employee_id"], employee_one)
        self.assertEqual(data["filters"]["start_date"], TARGET.isoformat())

    def test_21_clearing_filters_restores_all_results(self):
        scenario = self.seed_valid_scenario()
        self.seed_entry(
            scenario["roster"],
            scenario["employee"],
            scenario["brand"],
            scenario["process"],
            SECOND_DATE,
        )

        filtered_status, filtered = self.month_entries(
            employee_id=scenario["employee"], start_date=TARGET, end_date=TARGET
        )
        cleared_status, cleared = self.month_entries()

        self.assertEqual(filtered_status, 200)
        self.assertEqual(cleared_status, 200)
        self.assertEqual(filtered["filtered_count"], 1)
        self.assertEqual(cleared["filtered_count"], 2)
        self.assertEqual(len(cleared["entries"]), cleared["total_entries"])

    def test_27_weekly_view_applies_combined_filters(self):
        employee_one = self.seed_employee("E1", "Employee One")
        employee_two = self.seed_employee("E2", "Employee Two")
        brand_one = self.seed_brand("Brand One")
        brand_two = self.seed_brand("Brand Two")
        process = self.seed_process("Process One")
        self.seed_assignment(employee_one, brand_one, process)
        self.seed_assignment(employee_one, brand_two, process)
        self.seed_assignment(employee_two, brand_one, process)
        roster_id = self.seed_roster()
        self.seed_entry(roster_id, employee_one, brand_one, process, TARGET)
        self.seed_entry(roster_id, employee_one, brand_two, process, SECOND_DATE)
        self.seed_entry(roster_id, employee_two, brand_one, process, SECOND_DATE)

        unfiltered_status, unfiltered = self.week_view(week_start="2026-12-07")
        filtered_status, filtered = self.week_view(
            week_start="2026-12-07", employee_id=employee_one, brand_id=brand_one
        )

        self.assertEqual(unfiltered_status, 200)
        self.assertEqual(unfiltered["entry_count"], 3)
        self.assertEqual(filtered_status, 200)
        self.assertEqual(filtered["entry_count"], 1)
        self.assertEqual(
            filtered["days"][3]["entries"][0]["employee_id"], employee_one
        )

    def test_28_employee_wise_and_range_validation_errors(self):
        self.seed_valid_scenario()

        status, data = self.employee_view(99999)
        self.assertEqual(status, 404)

        status, data = self.month_entries(start_date=SECOND_DATE, end_date=TARGET)
        self.assertEqual(status, 422)
        self.assertIn("start_date", data["detail"])

    # ---------- Regression coverage for Steps 20-23 ----------

    def test_22_existing_step_20_to_23_functionality_remains_intact(self):
        scenario = self.seed_valid_scenario()

        status, monthly = self.request("GET", f"/api/rosters/{YEAR}/{MONTH}")
        self.assertEqual(status, 200)
        self.assertEqual(monthly["entries"][0]["employee_id"], scenario["employee"])

        status, validation = self.request(
            "POST", f"/api/rosters/{YEAR}/{MONTH}/validate"
        )
        self.assertEqual(status, 200)
        self.assertEqual(validation["overall_status"], "Valid")

        status, duplicate = self.generate()
        self.assertEqual(status, 409)
        self.assertIn("already exists", duplicate["detail"])

        status, report = self.employee_view(scenario["employee"])
        self.assertEqual(status, 200)
        self.assertEqual(len(report["assignments"]), 1)


if __name__ == "__main__":
    unittest.main()
