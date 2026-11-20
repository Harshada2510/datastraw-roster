"""Pod CRUD API routes.

DELETE performs a soft delete: the pod is deactivated rather than removed.
``pod_lead_id`` is validated against the Employee table whenever it is supplied.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Pod
from app.schemas.pod import PodCreate, PodResponse, PodUpdate

router = APIRouter(prefix="/api/pods", tags=["Pods"])


def _get_pod_or_404(db: Session, pod_id: int) -> Pod:
    """Fetch a pod or raise HTTP 404."""
    pod = db.get(Pod, pod_id)
    if pod is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pod not found",
        )
    return pod


def _ensure_unique_name(
    db: Session,
    pod_name: str,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 if the name belongs to a different pod.

    Comparisons are case-insensitive; ``exclude_id`` keeps updates to the same
    pod from conflicting with their own existing name.
    """
    statement = select(Pod.id).where(
        func.lower(Pod.pod_name) == pod_name.lower()
    )
    if exclude_id is not None:
        statement = statement.where(Pod.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pod with this pod_name already exists",
        )


def _ensure_employee_exists(db: Session, pod_lead_id: int) -> None:
    """Raise HTTP 404 when the requested pod lead does not exist."""
    statement = select(Employee.id).where(Employee.id == pod_lead_id)
    if db.execute(statement).first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )


@router.get("", response_model=list[PodResponse])
def list_pods(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all pods (active and inactive), ordered by id."""
    statement = select(Pod).order_by(Pod.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get("/{pod_id}", response_model=PodResponse)
def get_pod(pod_id: int, db: Session = Depends(get_db)):
    """Return one pod by id, or HTTP 404."""
    return _get_pod_or_404(db, pod_id)


@router.post(
    "",
    response_model=PodResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pod(payload: PodCreate, db: Session = Depends(get_db)):
    """Create a pod. Duplicate name returns 409; unknown lead returns 404."""
    _ensure_unique_name(db, payload.pod_name)
    if payload.pod_lead_id is not None:
        _ensure_employee_exists(db, payload.pod_lead_id)

    pod = Pod(**payload.model_dump())
    db.add(pod)
    try:
        db.commit()
    except IntegrityError as exc:
        # Covers a concurrent insert that slipped past the pre-checks.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pod with this pod_name already exists or the pod lead no longer exists",
        ) from exc

    db.refresh(pod)
    return pod


@router.put("/{pod_id}", response_model=PodResponse)
def update_pod(
    pod_id: int,
    payload: PodUpdate,
    db: Session = Depends(get_db),
):
    """Update supplied fields of a pod; HTTP 404/409 as appropriate."""
    pod = _get_pod_or_404(db, pod_id)
    values = payload.model_dump(exclude_unset=True)

    if values.get("pod_name") is not None:
        _ensure_unique_name(
            db,
            pod_name=values["pod_name"],
            exclude_id=pod_id,
        )

    if "pod_lead_id" in values and values["pod_lead_id"] is not None:
        _ensure_employee_exists(db, values["pod_lead_id"])

    for field, value in values.items():
        setattr(pod, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pod with this pod_name already exists or the pod lead no longer exists",
        ) from exc

    db.refresh(pod)
    return pod


@router.delete("/{pod_id}", response_model=PodResponse)
def deactivate_pod(pod_id: int, db: Session = Depends(get_db)):
    """Soft-delete a pod by setting is_active to False."""
    pod = _get_pod_or_404(db, pod_id)
    pod.is_active = False
    db.commit()
    db.refresh(pod)
    return pod
