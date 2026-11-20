"""Employee-Brand-Process assignment API routes.

An employee may hold many assignments as long as each
(employee_id, brand_id, process_id) combination is unique.
DELETE removes the assignment (the model has no is_active column).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, Employee, EmployeeAssignment, Process
from app.schemas.assignment import (
    EmployeeAssignmentCreate,
    EmployeeAssignmentResponse,
    EmployeeAssignmentUpdate,
)

router = APIRouter(prefix="/api", tags=["Assignments"])


def _get_assignment_or_404(db: Session, assignment_id: int) -> EmployeeAssignment:
    """Fetch an assignment or raise HTTP 404."""
    assignment = db.get(EmployeeAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    return assignment


def _ensure_related_records_exist(
    db: Session,
    employee_id: int,
    brand_id: int,
    process_id: int,
) -> None:
    """Raise HTTP 404 when any referenced record does not exist."""
    for model, record_id, label in (
        (Employee, employee_id, "Employee"),
        (Brand, brand_id, "Brand"),
        (Process, process_id, "Process"),
    ):
        if db.get(model, record_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{label} not found",
            )


def _ensure_unique_combination(
    db: Session,
    employee_id: int,
    brand_id: int,
    process_id: int,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 for a duplicate employee/brand/process combination."""
    statement = select(EmployeeAssignment.id).where(
        EmployeeAssignment.employee_id == employee_id,
        EmployeeAssignment.brand_id == brand_id,
        EmployeeAssignment.process_id == process_id,
    )
    if exclude_id is not None:
        statement = statement.where(EmployeeAssignment.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An assignment with this employee_id, brand_id and process_id already exists",
        )


@router.get(
    "/assignments", response_model=list[EmployeeAssignmentResponse]
)
def list_assignments(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all assignments, ordered by id."""
    statement = (
        select(EmployeeAssignment)
        .order_by(EmployeeAssignment.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get(
    "/employees/{employee_id}/assignments",
    response_model=list[EmployeeAssignmentResponse],
)
def list_employee_assignments(
    employee_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List assignments for one employee; HTTP 404 if the employee is missing."""
    if db.get(Employee, employee_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    statement = (
        select(EmployeeAssignment)
        .where(EmployeeAssignment.employee_id == employee_id)
        .order_by(EmployeeAssignment.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(statement).scalars().all()


@router.get(
    "/assignments/{assignment_id}", response_model=EmployeeAssignmentResponse
)
def get_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Return one assignment by id, or HTTP 404."""
    return _get_assignment_or_404(db, assignment_id)


@router.post(
    "/assignments",
    response_model=EmployeeAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    payload: EmployeeAssignmentCreate, db: Session = Depends(get_db)
):
    """Create an assignment. Unknown references return 404, duplicates 409."""
    employee_id = payload.employee_id
    brand_id = payload.brand_id
    process_id = payload.process_id

    _ensure_related_records_exist(db, employee_id, brand_id, process_id)
    _ensure_unique_combination(db, employee_id, brand_id, process_id)

    assignment = EmployeeAssignment(**payload.model_dump())
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError as exc:
        # Covers a concurrent insert that slipped past the pre-checks.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An assignment with this employee_id, brand_id and process_id already exists",
        ) from exc

    db.refresh(assignment)
    return assignment


@router.put(
    "/assignments/{assignment_id}", response_model=EmployeeAssignmentResponse
)
def update_assignment(
    assignment_id: int,
    payload: EmployeeAssignmentUpdate,
    db: Session = Depends(get_db),
):
    """Partially update an assignment; HTTP 404/409 as appropriate."""
    assignment = _get_assignment_or_404(db, assignment_id)
    values = payload.model_dump(exclude_unset=True)

    # Resolve the final combination using current values for fields not supplied.
    employee_id = values.get("employee_id", assignment.employee_id)
    brand_id = values.get("brand_id", assignment.brand_id)
    process_id = values.get("process_id", assignment.process_id)

    _ensure_related_records_exist(db, employee_id, brand_id, process_id)
    _ensure_unique_combination(
        db,
        employee_id,
        brand_id,
        process_id,
        exclude_id=assignment_id,
    )

    for field, value in values.items():
        setattr(assignment, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An assignment with this employee_id, brand_id and process_id already exists",
        ) from exc

    db.refresh(assignment)
    return assignment


@router.delete(
    "/assignments/{assignment_id}", response_model=EmployeeAssignmentResponse
)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Remove an assignment and return the deleted record."""
    assignment = _get_assignment_or_404(db, assignment_id)
    deleted = EmployeeAssignmentResponse.model_validate(assignment)

    try:
        db.delete(assignment)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The assignment could not be removed",
        ) from exc

    return deleted
