"""Staffing requirement API routes.

A requirement defines how many employees a brand/process needs over an
inclusive date range. A single date is stored as ``start_date == end_date``.
Requirements for the same brand/process may not overlap.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, Process, StaffingRequirement
from app.schemas.staffing_requirement import (
    StaffingRequirementCreate,
    StaffingRequirementResponse,
    StaffingRequirementUpdate,
)

router = APIRouter(prefix="/api", tags=["Staffing Requirements"])


def _get_requirement_or_404(
    db: Session, requirement_id: int
) -> StaffingRequirement:
    """Fetch a staffing requirement or raise HTTP 404."""
    requirement = db.get(StaffingRequirement, requirement_id)
    if requirement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staffing requirement not found",
        )
    return requirement


def _ensure_brand_and_process_exist(
    db: Session, brand_id: int, process_id: int
) -> None:
    """Raise HTTP 404 when the referenced brand or process does not exist."""
    for model, record_id, label in (
        (Brand, brand_id, "Brand"),
        (Process, process_id, "Process"),
    ):
        if db.get(model, record_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{label} not found",
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
    brand_id: int,
    process_id: int,
    start_date: date,
    end_date: date,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 when another requirement for the pair overlaps.

    Inclusive boundaries are used: a requirement ending on the day another
    begins is not an overlap.
    """
    statement = select(StaffingRequirement.id).where(
        StaffingRequirement.brand_id == brand_id,
        StaffingRequirement.process_id == process_id,
        StaffingRequirement.start_date <= end_date,
        StaffingRequirement.end_date >= start_date,
    )
    if exclude_id is not None:
        statement = statement.where(StaffingRequirement.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A staffing requirement for this brand and process already "
                "overlaps the requested date range"
            ),
        )


@router.get(
    "/staffing-requirements", response_model=list[StaffingRequirementResponse]
)
def list_staffing_requirements(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    brand_id: int | None = Query(default=None, ge=1),
    process_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    """List staffing requirements with pagination and optional brand/process filters."""
    statement = select(StaffingRequirement)
    if brand_id is not None:
        statement = statement.where(StaffingRequirement.brand_id == brand_id)
    if process_id is not None:
        statement = statement.where(StaffingRequirement.process_id == process_id)
    statement = (
        statement.order_by(StaffingRequirement.start_date, StaffingRequirement.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get(
    "/staffing-requirements/{requirement_id}",
    response_model=StaffingRequirementResponse,
)
def get_staffing_requirement(
    requirement_id: int, db: Session = Depends(get_db)
):
    """Return one staffing requirement by id, or HTTP 404."""
    return _get_requirement_or_404(db, requirement_id)


@router.post(
    "/staffing-requirements",
    response_model=StaffingRequirementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_staffing_requirement(
    payload: StaffingRequirementCreate, db: Session = Depends(get_db)
):
    """Create a requirement; invalid references 404, overlaps 409."""
    _ensure_brand_and_process_exist(db, payload.brand_id, payload.process_id)
    _validate_date_range(payload.start_date, payload.end_date)
    _ensure_no_overlap(
        db,
        payload.brand_id,
        payload.process_id,
        payload.start_date,
        payload.end_date,
    )

    requirement = StaffingRequirement(**payload.model_dump())
    db.add(requirement)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A staffing requirement for this brand and process already "
                "overlaps the requested date range"
            ),
        ) from exc

    db.refresh(requirement)
    return requirement


@router.put(
    "/staffing-requirements/{requirement_id}",
    response_model=StaffingRequirementResponse,
)
def update_staffing_requirement(
    requirement_id: int,
    payload: StaffingRequirementUpdate,
    db: Session = Depends(get_db),
):
    """Partially update a requirement; HTTP 404/409/422 as appropriate."""
    requirement = _get_requirement_or_404(db, requirement_id)
    values = payload.model_dump(exclude_unset=True)

    brand_id = values.get("brand_id", requirement.brand_id)
    process_id = values.get("process_id", requirement.process_id)
    start_date = values.get("start_date", requirement.start_date)
    end_date = values.get("end_date", requirement.end_date)

    _ensure_brand_and_process_exist(db, brand_id, process_id)
    _validate_date_range(start_date, end_date)
    _ensure_no_overlap(
        db,
        brand_id,
        process_id,
        start_date,
        end_date,
        exclude_id=requirement_id,
    )

    for field, value in values.items():
        setattr(requirement, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A staffing requirement for this brand and process already "
                "overlaps the requested date range"
            ),
        ) from exc

    db.refresh(requirement)
    return requirement


@router.delete(
    "/staffing-requirements/{requirement_id}",
    response_model=StaffingRequirementResponse,
)
def delete_staffing_requirement(
    requirement_id: int, db: Session = Depends(get_db)
):
    """Remove a staffing requirement and return the deleted record."""
    requirement = _get_requirement_or_404(db, requirement_id)
    deleted = StaffingRequirementResponse.model_validate(requirement)

    try:
        db.delete(requirement)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The staffing requirement could not be removed",
        ) from exc

    return deleted
