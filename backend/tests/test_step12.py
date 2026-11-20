"""Automated tests for Step 12 (Leave, Weekly Off, Holiday APIs).

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


class Step12ApiTests(unittest.TestCase):
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

    def test_leave_crud_and_validation(self):
        employee_id = self.create_employee()
        other_id = self.create_employee("E2", "Employee Two")

        status, leave = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-01-05",
                "end_date": "2026-01-09",
                "leave_type": "Casual",
                "status": "pending",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(leave["status"], "Pending")
        leave_id = leave["id"]

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-01-08",
                "end_date": "2026-01-12",
                "leave_type": "Sick",
            },
        )
        self.assertEqual(status, 409)

        status, adjacent = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-01-10",
                "end_date": "2026-01-12",
                "leave_type": "Earned",
            },
        )
        self.assertEqual(status, 201)
        adjacent_id = adjacent["id"]

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": other_id,
                "start_date": "2026-01-06",
                "end_date": "2026-01-07",
                "leave_type": "Casual",
            },
        )
        self.assertEqual(status, 201)

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": 9999,
                "start_date": "2026-01-05",
                "end_date": "2026-01-06",
                "leave_type": "Casual",
            },
        )
        self.assertEqual(status, 404)

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-01-10",
                "end_date": "2026-01-01",
                "leave_type": "Casual",
            },
        )
        self.assertEqual(status, 422)

        status, _ = self.request(
            "POST",
            "/api/leaves",
            body={
                "employee_id": employee_id,
                "start_date": "2026-02-01",
                "end_date": "2026-02-02",
                "leave_type": "Casual",
                "status": "Maybe",
            },
        )
        self.assertEqual(status, 422)

        status, listing = self.request("GET", "/api/leaves")
        self.assertEqual((status, len(listing)), (200, 3))
        status, paged = self.request("GET", "/api/leaves", b"limit=1")
        self.assertEqual((status, len(paged)), (200, 1))
        status, employee_leaves = self.request(
            "GET", f"/api/employees/{employee_id}/leaves"
        )
        self.assertEqual((status, len(employee_leaves)), (200, 2))
        self.assertEqual(
            self.request("GET", "/api/employees/9999/leaves")[0], 404
        )
        self.assertEqual(self.request("GET", f"/api/leaves/{leave_id}")[0], 200)
        self.assertEqual(self.request("GET", "/api/leaves/9999")[0], 404)

        status, _ = self.request(
            "PUT",
            f"/api/leaves/{adjacent_id}",
            body={"start_date": "2026-01-08"},
        )
        self.assertEqual(status, 409)

        status, updated = self.request(
            "PUT",
            f"/api/leaves/{leave_id}",
            body={"status": "Approved", "reason": "Family event"},
        )
        self.assertEqual((status, updated["status"]), (200, "Approved"))

        status, _ = self.request(
            "PUT", f"/api/leaves/{leave_id}", body={"start_date": "2026-01-11"}
        )
        self.assertEqual(status, 422)

        status, deleted = self.request("DELETE", f"/api/leaves/{leave_id}")
        self.assertEqual((status, deleted["id"]), (200, leave_id))
        self.assertEqual(self.request("GET", f"/api/leaves/{leave_id}")[0], 404)
        self.assertEqual(len(self.request("GET", "/api/leaves")[1]), 2)

    def test_weekly_off_crud_and_validation(self):
        employee_id = self.create_employee()

        status, monday = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "monday"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(monday["day_of_week"], "Monday")
        monday_id = monday["id"]

        status, _ = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "Monday"},
        )
        self.assertEqual(status, 409)

        status, _ = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "FunDay"},
        )
        self.assertEqual(status, 422)

        status, _ = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": 9999, "day_of_week": "Tuesday"},
        )
        self.assertEqual(status, 404)

        status, tuesday = self.request(
            "POST",
            "/api/weekly-offs",
            body={"employee_id": employee_id, "day_of_week": "Tuesday"},
        )
        self.assertEqual(status, 201)

        status, listing = self.request("GET", "/api/weekly-offs")
        self.assertEqual((status, len(listing)), (200, 2))
        status, paged = self.request("GET", "/api/weekly-offs", b"limit=1")
        self.assertEqual((status, len(paged)), (200, 1))
        status, employee_days = self.request(
            "GET", f"/api/employees/{employee_id}/weekly-offs"
        )
        self.assertEqual((status, len(employee_days)), (200, 2))
        self.assertEqual(
            self.request("GET", "/api/employees/9999/weekly-offs")[0], 404
        )
        self.assertEqual(self.request("GET", f"/api/weekly-offs/{monday_id}")[0], 200)
        self.assertEqual(self.request("GET", "/api/weekly-offs/9999")[0], 404)

        status, updated = self.request(
            "PUT",
            f"/api/weekly-offs/{monday_id}",
            body={"day_of_week": "Wednesday"},
        )
        self.assertEqual((status, updated["day_of_week"]), (200, "Wednesday"))

        status, _ = self.request(
            "PUT",
            f"/api/weekly-offs/{tuesday['id']}",
            body={"day_of_week": "Wednesday"},
        )
        self.assertEqual(status, 409)

        status, deleted = self.request("DELETE", f"/api/weekly-offs/{monday_id}")
        self.assertEqual((status, deleted["id"]), (200, monday_id))
        self.assertEqual(self.request("GET", f"/api/weekly-offs/{monday_id}")[0], 404)

    def test_holiday_crud_and_validation(self):
        status, holiday = self.request(
            "POST",
            "/api/holidays",
            body={
                "holiday_name": "Republic Day",
                "holiday_date": "2026-01-26",
                "description": "National holiday",
            },
        )
        self.assertEqual(status, 201)
        holiday_id = holiday["id"]

        status, _ = self.request(
            "POST",
            "/api/holidays",
            body={"holiday_name": "Another Event", "holiday_date": "2026-01-26"},
        )
        self.assertEqual(status, 409)

        status, _ = self.request(
            "POST", "/api/holidays", body={"holiday_date": "2026-02-01"}
        )
        self.assertEqual(status, 422)

        status, _ = self.request(
            "POST", "/api/holidays", body={"holiday_name": "No Date"}
        )
        self.assertEqual(status, 422)

        status, second = self.request(
            "POST",
            "/api/holidays",
            body={"holiday_name": "Diwali", "holiday_date": "2026-11-08"},
        )
        self.assertEqual(status, 201)

        status, listing = self.request("GET", "/api/holidays")
        self.assertEqual((status, len(listing)), (200, 2))
        status, paged = self.request("GET", "/api/holidays", b"limit=1")
        self.assertEqual((status, len(paged)), (200, 1))
        self.assertEqual(self.request("GET", f"/api/holidays/{holiday_id}")[0], 200)
        self.assertEqual(self.request("GET", "/api/holidays/9999")[0], 404)

        status, updated = self.request(
            "PUT",
            f"/api/holidays/{holiday_id}",
            body={"holiday_name": "Republic Day 2026"},
        )
        self.assertEqual((status, updated["holiday_name"]), (200, "Republic Day 2026"))

        status, _ = self.request(
            "PUT",
            f"/api/holidays/{holiday_id}",
            body={"holiday_date": "2026-11-08"},
        )
        self.assertEqual(status, 409)

        status, deleted = self.request("DELETE", f"/api/holidays/{holiday_id}")
        self.assertEqual((status, deleted["id"]), (200, holiday_id))
        self.assertEqual(self.request("GET", f"/api/holidays/{holiday_id}")[0], 404)

    def test_existing_api_regression(self):
        employee_id = self.create_employee()
        self.assertEqual(self.request("GET", "/api/employees")[0], 200)

        status, brand = self.request(
            "POST", "/api/brands", body={"brand_name": "Brand One"}
        )
        self.assertEqual(status, 201)
        self.assertEqual(self.request("GET", "/api/brands")[0], 200)

        status, process = self.request(
            "POST", "/api/processes", body={"process_name": "Process One"}
        )
        self.assertEqual(status, 201)
        self.assertEqual(self.request("GET", "/api/processes")[0], 200)

        status, pod = self.request(
            "POST",
            "/api/pods",
            body={"pod_name": "Pod One", "pod_lead_id": employee_id},
        )
        self.assertEqual((status, pod["pod_lead_id"]), (201, employee_id))
        self.assertEqual(self.request("GET", "/api/pods")[0], 200)

        status, assignment = self.request(
            "POST",
            "/api/assignments",
            body={
                "employee_id": employee_id,
                "brand_id": brand["id"],
                "process_id": process["id"],
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(
            self.request("GET", f"/api/employees/{employee_id}/assignments")[0], 200
        )
        self.assertEqual(self.request("GET", "/api/assignments")[0], 200)

    def test_pagination_path_and_empty_update_validation(self):
        for path in ("/api/leaves", "/api/weekly-offs", "/api/holidays"):
            self.assertEqual(self.request("GET", path, b"skip=-1")[0], 422)
            self.assertEqual(self.request("GET", path, b"limit=0")[0], 422)
            self.assertEqual(self.request("GET", path, b"limit=501")[0], 422)

        for path in ("/api/leaves/abc", "/api/weekly-offs/abc", "/api/holidays/abc"):
            self.assertEqual(self.request("GET", path)[0], 422)

        for path in ("/api/leaves/1", "/api/weekly-offs/1", "/api/holidays/1"):
            self.assertEqual(self.request("PUT", path, body={})[0], 422)


if __name__ == "__main__":
    unittest.main()
