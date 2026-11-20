"""Process CRUD API routes.

DELETE performs a soft delete: the process is deactivated rather than removed.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Process
from app.schemas.process import ProcessCreate, ProcessResponse, ProcessUpdate

router = APIRouter(prefix="/api/processes", tags=["Processes"])


def _get_process_or_404(db: Session, process_id: int) -> Process:
    """Fetch a process or raise HTTP 404."""
    process = db.get(Process, process_id)
    if process is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Process not found",
        )
    return process


def _ensure_unique_name(
    db: Session,
    process_name: str,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 if the name belongs to a different process.

    Comparisons are case-insensitive; ``exclude_id`` keeps updates to the same
    process from conflicting with their own existing name.
    """
    statement = select(Process.id).where(
        func.lower(Process.process_name) == process_name.lower()
    )
    if exclude_id is not None:
        statement = statement.where(Process.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A process with this process_name already exists",
        )


@router.get("", response_model=list[ProcessResponse])
def list_processes(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all processes (active and inactive), ordered by id."""
    statement = select(Process).order_by(Process.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get("/{process_id}", response_model=ProcessResponse)
def get_process(process_id: int, db: Session = Depends(get_db)):
    """Return one process by id, or HTTP 404."""
    return _get_process_or_404(db, process_id)


@router.post(
    "",
    response_model=ProcessResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_process(payload: ProcessCreate, db: Session = Depends(get_db)):
    """Create a process. Duplicate name returns HTTP 409."""
    _ensure_unique_name(db, payload.process_name)

    process = Process(**payload.model_dump())
    db.add(process)
    try:
        db.commit()
    except IntegrityError as exc:
        # Covers a concurrent insert that slipped past the pre-check.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A process with this process_name already exists",
        ) from exc

    db.refresh(process)
    return process


@router.put("/{process_id}", response_model=ProcessResponse)
def update_process(
    process_id: int,
    payload: ProcessUpdate,
    db: Session = Depends(get_db),
):
    """Update supplied fields of a process; HTTP 404/409 as appropriate."""
    process = _get_process_or_404(db, process_id)
    values = payload.model_dump(exclude_unset=True)

    if values.get("process_name") is not None:
        _ensure_unique_name(
            db,
            process_name=values["process_name"],
            exclude_id=process_id,
        )

    for field, value in values.items():
        setattr(process, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A process with this process_name already exists",
        ) from exc

    db.refresh(process)
    return process


@router.delete("/{process_id}", response_model=ProcessResponse)
def deactivate_process(process_id: int, db: Session = Depends(get_db)):
    """Soft-delete a process by setting is_active to False."""
    process = _get_process_or_404(db, process_id)
    process.is_active = False
    db.commit()
    db.refresh(process)
    return process
