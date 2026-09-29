from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module, user_has_permission_db
from app.services import recycle_bin
from app.services.company_service import get_company_by_user_id

router = APIRouter(prefix="/recycle-bin", tags=["recycle-bin"])


def _resource(key: str) -> recycle_bin.BinResource:
    res = recycle_bin.BY_KEY.get(key)
    if not res:
        raise HTTPException(status_code=404, detail="Unknown resource")
    return res


def _require(db: Session, user: User, res: recycle_bin.BinResource, action: str) -> None:
    """The bin never grants more than the module it is showing.

    Seeing a deleted invoice needs the right to see invoices, restoring one needs the right
    to delete them back, and destroying one needs the separate permanent-delete right.
    """
    if not user_has_permission_db(db, user, f"{res.module}.{action}"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("")
def list_bin(
    resource: Optional[str] = None,
    search: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("recycle_bin", "view")),
):
    """Everything this company has deleted, newest first.

    Categories the signed-in role cannot view are left out entirely rather than shown
    empty, so the bin never hints at records the role is not allowed to know about.
    """
    company = get_company_by_user_id(db, current_user.id)
    allowed = [
        r.key
        for r in recycle_bin.RESOURCES
        if user_has_permission_db(db, current_user, f"{r.module}.view")
    ]
    if resource:
        if resource not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        keys = [resource]
    else:
        keys = allowed

    out = {"items": [], "counts": {}, "total": 0, "resources": []}
    for key in keys:
        part = recycle_bin.list_bin(db, company.id, resource=key, search=search)
        out["items"].extend(part["items"])
        out["counts"][key] = part["counts"][key]
    out["total"] = sum(out["counts"].values())
    out["items"].sort(key=lambda e: (e["deleted_at"] is None, e["deleted_at"]), reverse=True)
    out["resources"] = [
        {
            "key": r.key,
            "label": r.label,
            "plural": r.plural,
            "can_restore": user_has_permission_db(db, current_user, f"{r.module}.restore"),
            "can_purge": user_has_permission_db(db, current_user, f"{r.module}.delete_permanent"),
        }
        for r in recycle_bin.RESOURCES
        if r.key in allowed
    ]
    return out


@router.post("/{resource}/{item_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_item(
    resource: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("recycle_bin", "view")),
):
    res = _resource(resource)
    _require(db, current_user, res, "restore")
    company = get_company_by_user_id(db, current_user.id)
    recycle_bin.restore(db, res, company.id, item_id, current_user.id)


@router.delete("/{resource}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def purge_item(
    resource: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("recycle_bin", "view")),
):
    """Destroy one item for good. There is no way back from here."""
    res = _resource(resource)
    _require(db, current_user, res, "delete_permanent")
    company = get_company_by_user_id(db, current_user.id)
    recycle_bin.purge(db, res, company.id, item_id, current_user.id)
