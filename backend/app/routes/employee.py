"""Employee CRUD API routes.

DELETE performs a soft delete: the employee is deactivated rather than removed.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate

router = APIRouter(prefix="/api/employees", tags=["Employees"])


def _get_employee_or_404(db: Session, employee_id: int) -> Employee:
    """Fetch an employee or raise HTTP 404."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    return employee


def _ensure_unique(
    db: Session,
    employee_code: str | None = None,
    email: str | None = None,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 if the code or email belongs to a different employee.

    Comparisons are case-insensitive; ``exclude_id`` keeps updates to the same
    employee from conflicting with their own existing values.
    """
    if employee_code is not None:
        statement = select(Employee.id).where(
            func.lower(Employee.employee_code) == employee_code.lower()
        )
        if exclude_id is not None:
            statement = statement.where(Employee.id != exclude_id)
        if db.execute(statement).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this employee_code already exists",
            )

    if email is not None:
        statement = select(Employee.id).where(
            func.lower(Employee.email) == email.lower()
        )
        if exclude_id is not None:
            statement = statement.where(Employee.id != exclude_id)
        if db.execute(statement).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this email already exists",
            )


@router.get("", response_model=list[EmployeeResponse])
def list_employees(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all employees (active and inactive), ordered by id."""
    statement = select(Employee).order_by(Employee.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    """Return one employee by id, or HTTP 404."""
    return _get_employee_or_404(db, employee_id)


@router.post(
    "",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    """Create an employee. Duplicate code/email returns HTTP 409."""
    _ensure_unique(db, payload.employee_code, payload.email)

    employee = Employee(**payload.model_dump())
    db.add(employee)
    try:
        db.commit()
    except IntegrityError as exc:
        # Covers a concurrent insert that slipped past the pre-check.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this employee_code or email already exists",
        ) from exc

    db.refresh(employee)
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
):
    """Update supplied fields of an employee; HTTP 404/409 as appropriate."""
    employee = _get_employee_or_404(db, employee_id)
    values = payload.model_dump(exclude_unset=True)

    _ensure_unique(
        db,
        employee_code=values.get("employee_code"),
        email=values.get("email"),
        exclude_id=employee_id,
    )

    for field, value in values.items():
        setattr(employee, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this employee_code or email already exists",
        ) from exc

    db.refresh(employee)
    return employee


@router.delete("/{employee_id}", response_model=EmployeeResponse)
def deactivate_employee(employee_id: int, db: Session = Depends(get_db)):
    """Soft-delete an employee by setting is_active to False."""
    employee = _get_employee_or_404(db, employee_id)
    employee.is_active = False
    db.commit()
    db.refresh(employee)
    return employee
