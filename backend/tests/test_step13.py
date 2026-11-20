"""Automated tests for Step 13 (Calendar and Staffing Requirement APIs).

Uses an isolated in-memory SQLite database via a get_db dependency override.
No MySQL connection is made and no production data is touched.
"""

import asyncio
import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


class Step13ApiTests(unittest.TestCase):
    """End-to-end API tests with a fresh SQLite database per test."""

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
        Base.metadata.drop_all(self.test_engine)
        Base.metadata.create_all(self.test_engine)

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

    def create_employee(self, code="E1", name="Employee One"):
        status, data = self.request(
            "POST",
            "/api/employees",
            body={"employee_code": code, "full_name": name},
        )
        self.assertEqual(status, 201)
        return data["id"]

    def create_brand(self, name="Brand One"):
        status, data = self.request(
            "POST", "/api/brands", body={"brand_name": name}
        )
        self.assertEqual(status, 201)
        return data["id"]

    def create_process(self, name="Process One"):
        status, data = self.request(
            "POST", "/api/processes", body={"process_name": name}
        )
        self.assertEqual(status, 201)
        return data["id"]

    def test_calendar_month_structure_and_validation(self):
        employee_id = self.create_employee()
        other_id = self.create_employee("E2", "Employee Two")
        self.create_brand()
        self.create_process()

        status, holiday = self.request(
            "POST",
            "/api/holidays",
            body={"holiday_name": "Republic Day", "holiday_date": "2026-01-26"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(
            self.request(
                "POST",
                "/api/holidays",
                body={"holiday_name": "Out Of Month", "holiday_date": "2026-02-14"},
            )[0],
            201,
        )

        # Leave spanning the month boundary and one fully inside the month.
        status, spanning = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2025-12-28",
                "end_date": "2026-01-02",
                "leave_type": "Casual",
            },
        )
        self.assertEqual(status, 201)
        status, in_month = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": other_id,
                "start_date": "2026-01-08",
                "end_date": "2026-01-10",
                "leave_type": "Sick",
                "status": "Approved",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(
            self.request(
                "POST",
                "/api/leaves",
                body={
                    "employee_id": other_id,
                    "start_date": "2026-03-01",
                    "end_date": "2026-03-02",
                    "leave_type": "Casual",
                },
            )[0],
            201,
        )

        status, sunday = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "Sunday"},
        )
        self.assertEqual(status, 201)
        status, monday = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": other_id, "day_of_week": "Monday"},
        )
        self.assertEqual(status, 201)

        status, data = self.request("GET", "/api/calendar", b"month=1&year=2026")
        self.assertEqual(status, 200)
        self.assertEqual(
            (data["year"], data["month"], data["month_name"], data["days_in_month"]),
            (2026, 1, "January", 31),
        )
        self.assertEqual((data["start_date"], data["end_date"]), ("2026-01-01", "2026-01-31"))
        self.assertEqual(len(data["days"]), 31)
        self.assertEqual([item["holiday_name"] for item in data["holidays"]], ["Republic Day"])
        self.assertEqual({item["id"] for item in data["leaves"]}, {spanning["id"], in_month["id"]})
        self.assertEqual({item["id"] for item in data["weekly_offs"]}, {sunday["id"], monday["id"]})

        by_employee = {item["id"]: item for item in data["leaves"]}
        self.assertEqual(by_employee[spanning["id"]]["employee_code"], "E1")
        self.assertEqual(by_employee[spanning["id"]]["employee_name"], "Employee One")
        self.assertEqual(by_employee[spanning["id"]]["status"], "Pending")

        # 2026-01-01 is a Thursday; Jan 4 is a Sunday and Jan 5 a Monday.
        jan_1 = data["days"][0]
        self.assertEqual(jan_1["date"], "2026-01-01")
        self.assertEqual(jan_1["day_of_week"], "Thursday")
        self.assertEqual(jan_1["leave_employee_ids"], [employee_id])
        self.assertEqual(data["days"][1]["leave_employee_ids"], [employee_id])
        self.assertEqual(data["days"][2]["leave_employee_ids"], [])
        self.assertEqual(data["days"][3]["weekly_off_employee_ids"], [employee_id])
        self.assertEqual(data["days"][4]["weekly_off_employee_ids"], [other_id])
        self.assertEqual(data["days"][7]["leave_employee_ids"], [other_id])
        jan_26 = data["days"][25]
        self.assertEqual(jan_26["holiday_ids"], [holiday["id"]])
        self.assertEqual(jan_26["holiday_names"], ["Republic Day"])

        status, path_data = self.request("GET", "/api/calendar/2026/1")
        self.assertEqual((status, path_data), (200, data))

        for query in (
            b"month=0&year=2026",
            b"month=13&year=2026",
            b"month=1&year=1999",
            b"month=1&year=2101",
            b"month=abc&year=2026",
        ):
            self.assertEqual(self.request("GET", "/api/calendar", query)[0], 422)

        for path in ("/api/calendar/2026/13", "/api/calendar/1999/1", "/api/calendar/2026/abc"):
            self.assertEqual(self.request("GET", path)[0], 422)

        status, april = self.request("GET", "/api/calendar", b"month=4&year=2026")
        self.assertEqual(status, 200)
        self.assertEqual(april["days_in_month"], 30)
        self.assertEqual(len(april["days"]), 30)
        self.assertEqual(april["holidays"], [])
        self.assertEqual(april["leaves"], [])
        # Weekly-offs recur every week, so they appear in every month.
        self.assertEqual({item["id"] for item in april["weekly_offs"]}, {sunday["id"], monday["id"]})

    def test_staffing_requirement_crud_and_validation(self):
        brand_id = self.create_brand()
        process_id = self.create_process()
        other_brand_id = self.create_brand("Brand Two")
        other_process_id = self.create_process("Process Two")

        status, single = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-01-05",
                "required_count": 4,
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(single["end_date"], "2026-01-05")
        self.assertEqual(single["required_count"], 4)
        single_id = single["id"]

        status, ranged = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-01-10",
                "end_date": "2026-01-12",
                "required_count": 6,
                "notes": "Peak season",
            },
        )
        self.assertEqual(status, 201)
        ranged_id = ranged["id"]

        status, _ = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-01-10",
                "end_date": "2026-01-12",
                "required_count": 9,
            },
        )
        self.assertEqual(status, 409)

        status, _ = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-01-11",
                "end_date": "2026-01-13",
                "required_count": 5,
            },
        )
        self.assertEqual(status, 409)

        status, adjacent = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-01-13",
                "end_date": "2026-01-15",
                "required_count": 3,
            },
        )
        self.assertEqual(status, 201)
        adjacent_id = adjacent["id"]

        status, different_pair = self.request(
            "POST",
            "/api/staffing-requirements",
            body={
                "brand_id": other_brand_id,
                "process_id": other_process_id,
                "start_date": "2026-01-10",
                "end_date": "2026-01-12",
                "required_count": 2,
            },
        )
        self.assertEqual(status, 201)
        other_id = different_pair["id"]

        invalid_payloads = (
            {
                "brand_id": 9999,
                "process_id": process_id,
                "start_date": "2026-02-01",
                "required_count": 1,
            },
            {
                "brand_id": brand_id,
                "process_id": 9999,
                "start_date": "2026-02-01",
                "required_count": 1,
            },
            {
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-02-01",
                "required_count": 0,
            },
            {
                "brand_id": brand_id,
                "process_id": process_id,
                "start_date": "2026-02-02",
                "end_date": "2026-02-01",
                "required_count": 1,
            },
            {"process_id": process_id, "start_date": "2026-02-01", "required_count": 1},
            {
                "brand_id": brand_id,
                "process_id": process_id,
                "required_count": 1,
            },
            {
                "brand_id": None,
                "process_id": process_id,
                "start_date": "2026-02-01",
                "required_count": 1,
            },
        )
        for body in invalid_payloads:
            expected = (
                404
                if body.get("brand_id") == 9999 or body.get("process_id") == 9999
                else 422
            )
            self.assertEqual(
                self.request("POST", "/api/staffing-requirements", body=body)[0],
                expected,
            )

        status, listing = self.request("GET", "/api/staffing-requirements")
        self.assertEqual((status, len(listing)), (200, 4))
        self.assertEqual(
            self.request("GET", "/api/staffing-requirements", b"limit=1")[1][0]["id"],
            single_id,
        )
        self.assertEqual(
            len(
                self.request(
                    "GET", "/api/staffing-requirements", f"brand_id={brand_id}".encode()
                )[1]
            ),
            3,
        )
        self.assertEqual(
            len(
                self.request(
                    "GET",
                    "/api/staffing-requirements",
                    f"process_id={other_process_id}".encode(),
                )[1]
            ),
            1,
        )
        self.assertEqual(
            self.request("GET", f"/api/staffing-requirements/{single_id}")[1]["id"],
            single_id,
        )
        self.assertEqual(self.request("GET", "/api/staffing-requirements/9999")[0], 404)
        self.assertEqual(self.request("GET", "/api/staffing-requirements/abc")[0], 422)

        status, updated = self.request(
            "PUT",
            f"/api/staffing-requirements/{single_id}",
            body={"required_count": 10},
        )
        self.assertEqual((status, updated["required_count"]), (200, 10))

        status, _ = self.request(
            "PUT",
            f"/api/staffing-requirements/{single_id}",
            body={"start_date": "2026-01-11", "end_date": "2026-01-13"},
        )
        self.assertEqual(status, 409)

        for body, expected in (
            ({"brand_id": 9999}, 404),
            ({"process_id": 9999}, 404),
            ({"required_count": 0}, 422),
            ({"end_date": "2026-01-01"}, 422),
            ({}, 422),
        ):
            self.assertEqual(
                self.request("PUT", f"/api/staffing-requirements/{ranged_id}", body=body)[0],
                expected,
            )

        status, cleared = self.request(
            "PUT",
            f"/api/staffing-requirements/{ranged_id}",
            body={"notes": None},
        )
        self.assertEqual((status, cleared["notes"]), (200, None))

        status, deleted = self.request(
            "DELETE", f"/api/staffing-requirements/{single_id}"
        )
        self.assertEqual((status, deleted["id"]), (200, single_id))
        self.assertEqual(self.request("GET", f"/api/staffing-requirements/{single_id}")[0], 404)
        self.assertEqual(len(self.request("GET", "/api/staffing-requirements")[1]), 3)
        for remaining in (ranged_id, adjacent_id, other_id):
            self.assertEqual(
                self.request("GET", f"/api/staffing-requirements/{remaining}")[0],
                200,
            )

    def test_existing_api_regression(self):
        employee_id = self.create_employee()
        brand_id = self.create_brand()
        process_id = self.create_process()

        status, assignment = self.request(
            "POST",
            "/api/assignments",
            body={
                "employee_id": employee_id,
                "brand_id": brand_id,
                "process_id": process_id,
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(
            self.request("GET", f"/api/employees/{employee_id}/assignments")[0], 200
        )

        status, _ = self.request(
            "POST",
            "/api/pods",
            body={"pod_name": "Pod One", "pod_lead_id": employee_id},
        )
        self.assertEqual(status, 201)

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-01-05",
                "end_date": "2026-01-06",
                "leave_type": "Casual",
            },
        )
        self.assertEqual(status, 201)

        status, _ = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "Sunday"},
        )
        self.assertEqual(status, 201)

        status, _ = self.request(
            "POST",
            "/api/holidays",
            body={"holiday_name": "Holiday One", "holiday_date": "2026-01-26"},
        )
        self.assertEqual(status, 201)

        for path, query in (
            ("/api/employees", b""),
            ("/api/brands", b""),
            ("/api/processes", b""),
            ("/api/pods", b""),
            ("/api/assignments", b""),
            ("/api/leaves", b""),
            ("/api/weekly-offs", b""),
            ("/api/holidays", b""),
            ("/api/calendar", b"month=1&year=2026"),
            ("/api/staffing-requirements", b""),
        ):
            self.assertEqual(self.request("GET", path, query)[0], 200, path)


if __name__ == "__main__":
    unittest.main()
