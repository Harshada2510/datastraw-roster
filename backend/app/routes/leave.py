"""Leave management API routes."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Leave
from app.schemas.leave import LeaveCreate, LeaveResponse, LeaveUpdate

router = APIRouter(prefix="/api", tags=["Leaves"])


def _get_leave_or_404(db: Session, leave_id: int) -> Leave:
    """Fetch a leave or raise HTTP 404."""
    leave = db.get(Leave, leave_id)
    if leave is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Leave not found",
        )
    return leave


def _ensure_employee_exists(db: Session, employee_id: int) -> None:
    """Raise HTTP 404 when the employee does not exist."""
    if db.get(Employee, employee_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )


def _validate_date_range(start_date: date, end_date: date) -> None:
    """Raise HTTP 422 for an invalid date range."""
    if end_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="end_date cannot be earlier than start_date",
        )


def _ensure_no_overlap(
    db: Session,
    employee_id: int,
    start_date: date,
    end_date: date,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 when the date range overlaps another leave for the employee.

    Inclusive boundaries are used: a leave ending on the day another begins is
    not treated as an overlap. All leave statuses are considered.
    """
    statement = select(Leave.id).where(
        Leave.employee_id == employee_id,
        Leave.start_date <= end_date,
        Leave.end_date >= start_date,
    )
    if exclude_id is not None:
        statement = statement.where(Leave.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Leave request overlaps an existing leave for this employee",
        )


@router.get("/leaves", response_model=list[LeaveResponse])
def list_leaves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all leave requests, ordered by id."""
    statement = select(Leave).order_by(Leave.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get(
    "/employees/{employee_id}/leaves", response_model=list[LeaveResponse]
)
def list_employee_leaves(
    employee_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List leave requests for one employee; HTTP 404 if the employee is missing."""
    _ensure_employee_exists(db, employee_id)
    statement = (
        select(Leave)
        .where(Leave.employee_id == employee_id)
        .order_by(Leave.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get("/leaves/{leave_id}", response_model=LeaveResponse)
def get_leave(leave_id: int, db: Session = Depends(get_db)):
    """Return one leave request by id, or HTTP 404."""
    return _get_leave_or_404(db, leave_id)


@router.post(
    "/leaves", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED
)
def create_leave(payload: LeaveCreate, db: Session = Depends(get_db)):
    """Create a leave request; HTTP 404/409/422 as appropriate."""
    _ensure_employee_exists(db, payload.employee_id)
    _validate_date_range(payload.start_date, payload.end_date)
    _ensure_no_overlap(
        db,
        payload.employee_id,
        payload.start_date,
        payload.end_date,
    )

    leave = Leave(**payload.model_dump())
    db.add(leave)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Leave conflicts with an existing record or the employee no longer exists",
        ) from exc

    db.refresh(leave)
    return leave


@router.put("/leaves/{leave_id}", response_model=LeaveResponse)
def update_leave(
    leave_id: int,
    payload: LeaveUpdate,
    db: Session = Depends(get_db),
):
    """Partially update a leave request; HTTP 404/409/422 as appropriate."""
    leave = _get_leave_or_404(db, leave_id)
    values = payload.model_dump(exclude_unset=True)

    employee_id = values.get("employee_id", leave.employee_id)
    start_date = values.get("start_date", leave.start_date)
    end_date = values.get("end_date", leave.end_date)

    _ensure_employee_exists(db, employee_id)
    _validate_date_range(start_date, end_date)
    _ensure_no_overlap(
        db,
        employee_id,
        start_date,
        end_date,
        exclude_id=leave_id,
    )

    for field, value in values.items():
        setattr(leave, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Leave conflicts with an existing record or the employee no longer exists",
        ) from exc

    db.refresh(leave)
    return leave


@router.delete("/leaves/{leave_id}", response_model=LeaveResponse)
def delete_leave(leave_id: int, db: Session = Depends(get_db)):
    """Remove a leave request and return the deleted record."""
    leave = _get_leave_or_404(db, leave_id)
    deleted = LeaveResponse.model_validate(leave)

    try:
        db.delete(leave)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The leave request could not be removed",
        ) from exc

    return deleted
