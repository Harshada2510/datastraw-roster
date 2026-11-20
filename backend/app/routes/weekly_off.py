"""Weekly off management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, WeeklyOff
from app.schemas.weekly_off import WeeklyOffCreate, WeeklyOffResponse, WeeklyOffUpdate

router = APIRouter(prefix="/api", tags=["Weekly Offs"])


def _get_weekly_off_or_404(db: Session, weekly_off_id: int) -> WeeklyOff:
    """Fetch a weekly off or raise HTTP 404."""
    weekly_off = db.get(WeeklyOff, weekly_off_id)
    if weekly_off is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Weekly off not found",
        )
    return weekly_off


def _ensure_employee_exists(db: Session, employee_id: int) -> None:
    """Raise HTTP 404 when the employee does not exist."""
    if db.get(Employee, employee_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )


def _ensure_unique_employee_day(
    db: Session,
    employee_id: int,
    day_of_week: str,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 for a duplicate employee/day combination."""
    statement = select(WeeklyOff.id).where(
        WeeklyOff.employee_id == employee_id,
        func.lower(WeeklyOff.day_of_week) == day_of_week.lower(),
    )
    if exclude_id is not None:
        statement = statement.where(WeeklyOff.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This employee already has a weekly off on that day",
        )


@router.get("/weekly-offs", response_model=list[WeeklyOffResponse])
def list_weekly_offs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all weekly offs, ordered by id."""
    statement = select(WeeklyOff).order_by(WeeklyOff.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get(
    "/employees/{employee_id}/weekly-offs", response_model=list[WeeklyOffResponse]
)
def list_employee_weekly_offs(
    employee_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List weekly offs for one employee; HTTP 404 if the employee is missing."""
    _ensure_employee_exists(db, employee_id)
    statement = (
        select(WeeklyOff)
        .where(WeeklyOff.employee_id == employee_id)
        .order_by(WeeklyOff.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get("/weekly-offs/{weekly_off_id}", response_model=WeeklyOffResponse)
def get_weekly_off(weekly_off_id: int, db: Session = Depends(get_db)):
    """Return one weekly off by id, or HTTP 404."""
    return _get_weekly_off_or_404(db, weekly_off_id)


@router.post(
    "/weekly-offs",
    response_model=WeeklyOffResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_weekly_off(payload: WeeklyOffCreate, db: Session = Depends(get_db)):
    """Create a weekly off; HTTP 404/409 as appropriate."""
    _ensure_employee_exists(db, payload.employee_id)
    _ensure_unique_employee_day(db, payload.employee_id, payload.day_of_week)

    weekly_off = WeeklyOff(**payload.model_dump())
    db.add(weekly_off)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This employee already has a weekly off on that day",
        ) from exc

    db.refresh(weekly_off)
    return weekly_off


@router.put("/weekly-offs/{weekly_off_id}", response_model=WeeklyOffResponse)
def update_weekly_off(
    weekly_off_id: int,
    payload: WeeklyOffUpdate,
    db: Session = Depends(get_db),
):
    """Partially update a weekly off; HTTP 404/409 as appropriate."""
    weekly_off = _get_weekly_off_or_404(db, weekly_off_id)
    values = payload.model_dump(exclude_unset=True)

    employee_id = values.get("employee_id", weekly_off.employee_id)
    day_of_week = values.get("day_of_week", weekly_off.day_of_week)

    _ensure_employee_exists(db, employee_id)
    _ensure_unique_employee_day(
        db,
        employee_id,
        day_of_week,
        exclude_id=weekly_off_id,
    )

    for field, value in values.items():
        setattr(weekly_off, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This employee already has a weekly off on that day",
        ) from exc

    db.refresh(weekly_off)
    return weekly_off


@router.delete("/weekly-offs/{weekly_off_id}", response_model=WeeklyOffResponse)
def delete_weekly_off(weekly_off_id: int, db: Session = Depends(get_db)):
    """Remove a weekly off and return the deleted record."""
    weekly_off = _get_weekly_off_or_404(db, weekly_off_id)
    deleted = WeeklyOffResponse.model_validate(weekly_off)

    try:
        db.delete(weekly_off)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The weekly off could not be removed",
        ) from exc

    return deleted
