"""Holiday management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Holiday
from app.schemas.holiday import HolidayCreate, HolidayResponse, HolidayUpdate

router = APIRouter(prefix="/api", tags=["Holidays"])


def _get_holiday_or_404(db: Session, holiday_id: int) -> Holiday:
    """Fetch a holiday or raise HTTP 404."""
    holiday = db.get(Holiday, holiday_id)
    if holiday is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Holiday not found",
        )
    return holiday


def _ensure_unique_date(
    db: Session,
    holiday_date,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 when another holiday uses the same date."""
    statement = select(Holiday.id).where(Holiday.holiday_date == holiday_date)
    if exclude_id is not None:
        statement = statement.where(Holiday.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A holiday already exists on this date",
        )


@router.get("/holidays", response_model=list[HolidayResponse])
def list_holidays(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all holidays, ordered by date then id."""
    statement = (
        select(Holiday)
        .order_by(Holiday.holiday_date, Holiday.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get("/holidays/{holiday_id}", response_model=HolidayResponse)
def get_holiday(holiday_id: int, db: Session = Depends(get_db)):
    """Return one holiday by id, or HTTP 404."""
    return _get_holiday_or_404(db, holiday_id)


@router.post(
    "/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED
)
def create_holiday(payload: HolidayCreate, db: Session = Depends(get_db)):
    """Create a holiday; HTTP 409 for a duplicate date."""
    _ensure_unique_date(db, payload.holiday_date)

    holiday = Holiday(**payload.model_dump())
    db.add(holiday)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A holiday already exists on this date",
        ) from exc

    db.refresh(holiday)
    return holiday


@router.put("/holidays/{holiday_id}", response_model=HolidayResponse)
def update_holiday(
    holiday_id: int,
    payload: HolidayUpdate,
    db: Session = Depends(get_db),
):
    """Partially update a holiday; HTTP 404/409 as appropriate."""
    holiday = _get_holiday_or_404(db, holiday_id)
    values = payload.model_dump(exclude_unset=True)

    if values.get("holiday_date") is not None:
        _ensure_unique_date(
            db,
            values["holiday_date"],
            exclude_id=holiday_id,
        )

    for field, value in values.items():
        setattr(holiday, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A holiday already exists on this date",
        ) from exc

    db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_id}", response_model=HolidayResponse)
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    """Remove a holiday and return the deleted record."""
    holiday = _get_holiday_or_404(db, holiday_id)
    deleted = HolidayResponse.model_validate(holiday)

    try:
        db.delete(holiday)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The holiday could not be removed",
        ) from exc

    return deleted
