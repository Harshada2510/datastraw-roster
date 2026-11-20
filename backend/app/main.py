
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import (
    assignment_router,
    brand_router,
    calendar_router,
    employee_router,
    holiday_router,
    leave_router,
    pod_router,
    process_router,
    roster_router,
    staffing_requirement_router,
    weekly_off_router,
)

app = FastAPI(
    title="DataStraw Smart Roster API",
    description="Employee and monthly roster management system",
    version="1.0.0"
)

# Allow React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Employee CRUD APIs (Step 7)
app.include_router(employee_router)

# Brand CRUD APIs (Step 8)
app.include_router(brand_router)

# Process CRUD APIs (Step 9)
app.include_router(process_router)

# Pod CRUD APIs (Step 10)
app.include_router(pod_router)

# Employee Assignment APIs (Step 11)
app.include_router(assignment_router)

# Leave / Weekly Off / Holiday APIs (Step 12)
app.include_router(leave_router)
app.include_router(weekly_off_router)
app.include_router(holiday_router)

# Calendar and Staffing Requirement APIs (Step 13)
app.include_router(calendar_router)
app.include_router(staffing_requirement_router)

# Monthly Roster Generation APIs (Step 20)
app.include_router(roster_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to DataStraw Smart Roster API",
        "status": "Running"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "application": "DataStraw Smart Roster"
    }
