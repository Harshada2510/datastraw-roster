"""Brand CRUD API routes.

DELETE performs a soft delete: the brand is deactivated rather than removed.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand
from app.schemas.brand import BrandCreate, BrandResponse, BrandUpdate

router = APIRouter(prefix="/api/brands", tags=["Brands"])


def _get_brand_or_404(db: Session, brand_id: int) -> Brand:
    """Fetch a brand or raise HTTP 404."""
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found",
        )
    return brand


def _ensure_unique_name(
    db: Session,
    brand_name: str,
    exclude_id: int | None = None,
) -> None:
    """Raise HTTP 409 if the name belongs to a different brand.

    Comparisons are case-insensitive; ``exclude_id`` keeps updates to the same
    brand from conflicting with their own existing name.
    """
    statement = select(Brand.id).where(
        func.lower(Brand.brand_name) == brand_name.lower()
    )
    if exclude_id is not None:
        statement = statement.where(Brand.id != exclude_id)
    if db.execute(statement).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand with this brand_name already exists",
        )


@router.get("", response_model=list[BrandResponse])
def list_brands(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all brands (active and inactive), ordered by id."""
    statement = select(Brand).order_by(Brand.id).offset(skip).limit(limit)
    return db.execute(statement).scalars().all()


@router.get("/{brand_id}", response_model=BrandResponse)
def get_brand(brand_id: int, db: Session = Depends(get_db)):
    """Return one brand by id, or HTTP 404."""
    return _get_brand_or_404(db, brand_id)


@router.post(
    "",
    response_model=BrandResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_brand(payload: BrandCreate, db: Session = Depends(get_db)):
    """Create a brand. Duplicate name returns HTTP 409."""
    _ensure_unique_name(db, payload.brand_name)

    brand = Brand(**payload.model_dump())
    db.add(brand)
    try:
        db.commit()
    except IntegrityError as exc:
        # Covers a concurrent insert that slipped past the pre-check.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand with this brand_name already exists",
        ) from exc

    db.refresh(brand)
    return brand


@router.put("/{brand_id}", response_model=BrandResponse)
def update_brand(
    brand_id: int,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
):
    """Update supplied fields of a brand; HTTP 404/409 as appropriate."""
    brand = _get_brand_or_404(db, brand_id)
    values = payload.model_dump(exclude_unset=True)

    if values.get("brand_name") is not None:
        _ensure_unique_name(
            db,
            brand_name=values["brand_name"],
            exclude_id=brand_id,
        )

    for field, value in values.items():
        setattr(brand, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand with this brand_name already exists",
        ) from exc

    db.refresh(brand)
    return brand


@router.delete("/{brand_id}", response_model=BrandResponse)
def deactivate_brand(brand_id: int, db: Session = Depends(get_db)):
    """Soft-delete a brand by setting is_active to False."""
    brand = _get_brand_or_404(db, brand_id)
    brand.is_active = False
    db.commit()
    db.refresh(brand)
    return brand
