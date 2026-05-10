from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Contractor, ContractorAssignment, ContractorKind, Site, User
from app.contractor_schemas import AssignmentCreate, AssignmentRead, ContractorCreate, ContractorListRead, ContractorRead, ContractorUpdate
from app.services import audit_service
from app.services.contractor_scope import assert_unified_main_sub_same_company
from app.services.plan_enforcement import check_contractors_feature, check_sub_contractors_feature


def create_contractor(db: Session, company_id: int, data: ContractorCreate, current_user: User) -> ContractorRead:
    check_contractors_feature(db, company_id)
    if data.type.value == "sub":
        check_sub_contractors_feature(db, company_id)
    dup = (
        db.query(Contractor)
        .filter(
            Contractor.company_id == company_id,
            Contractor.name == data.name,
            Contractor.type == ContractorKind(data.type.value),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="A contractor with this name and type already exists.")
    row = Contractor(
        company_id=company_id,
        name=data.name,
        type=ContractorKind(data.type.value),
        contact_email=str(data.contact_email) if data.contact_email else None,
        contact_phone=data.contact_phone,
        address=data.address,
        is_active=True,
    )
    db.add(row)
    db.flush()
    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=current_user.id,
        action="contractor_created",
        entity_type="contractor",
        meta={"contractor_id": str(row.id)},
    )
    db.commit()
    db.refresh(row)
    return ContractorRead.model_validate(row)


def list_contractors(
    db: Session,
    company_id: int,
    type_filter: str | None,
    is_active: bool | None,
) -> list[ContractorListRead]:
    q = db.query(Contractor).filter(Contractor.company_id == company_id)
    if type_filter in ("main", "sub"):
        q = q.filter(Contractor.type == ContractorKind(type_filter))
    if is_active is not None:
        q = q.filter(Contractor.is_active.is_(is_active))
    rows = q.order_by(Contractor.name).all()
    return [ContractorListRead.model_validate(r) for r in rows]


def get_contractor(db: Session, company_id: int, contractor_id: UUID) -> ContractorRead:
    row = db.query(Contractor).filter(Contractor.id == contractor_id, Contractor.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return ContractorRead.model_validate(row)


def update_contractor(
    db: Session,
    company_id: int,
    contractor_id: UUID,
    data: ContractorUpdate,
    current_user: User,
) -> ContractorRead:
    row = db.query(Contractor).filter(Contractor.id == contractor_id, Contractor.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contractor not found")
    payload = data.model_dump(exclude_unset=True)
    if "type" in payload and payload["type"] is not None:
        new_t = payload["type"]
        val = new_t.value if hasattr(new_t, "value") else new_t
        if val == "sub":
            check_sub_contractors_feature(db, company_id)
        payload["type"] = ContractorKind(val)
    if "contact_email" in payload and payload["contact_email"] is not None:
        payload["contact_email"] = str(payload["contact_email"])
    for k, v in payload.items():
        setattr(row, k, v)
    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=current_user.id,
        action="contractor_updated",
        entity_type="contractor",
        meta={"contractor_id": str(contractor_id)},
    )
    db.commit()
    db.refresh(row)
    return ContractorRead.model_validate(row)


def deactivate_contractor(db: Session, company_id: int, contractor_id: UUID, current_user: User) -> ContractorRead:
    row = db.query(Contractor).filter(Contractor.id == contractor_id, Contractor.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contractor not found")
    row.is_active = False
    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=current_user.id,
        action="contractor_deactivated",
        entity_type="contractor",
        meta={"contractor_id": str(contractor_id)},
    )
    db.commit()
    db.refresh(row)
    return ContractorRead.model_validate(row)


def _assignment_duplicate(
    db: Session,
    company_id: int,
    main_id: UUID,
    sub_id: UUID,
    site_id: int | None,
) -> bool:
    q = db.query(ContractorAssignment).filter(
        ContractorAssignment.company_id == company_id,
        ContractorAssignment.main_contractor_id == main_id,
        ContractorAssignment.sub_contractor_id == sub_id,
    )
    if site_id is None:
        q = q.filter(ContractorAssignment.site_id.is_(None))
    else:
        q = q.filter(ContractorAssignment.site_id == site_id)
    return q.first() is not None


def create_assignment(db: Session, company_id: int, data: AssignmentCreate, current_user: User) -> AssignmentRead:
    check_sub_contractors_feature(db, company_id)
    assert_unified_main_sub_same_company(db, company_id, data.main_contractor_id, data.sub_contractor_id)
    if data.site_id is not None:
        st = db.query(Site).filter(Site.id == data.site_id, Site.company_id == company_id).first()
        if not st:
            raise HTTPException(status_code=404, detail="Site not found")
    if _assignment_duplicate(db, company_id, data.main_contractor_id, data.sub_contractor_id, data.site_id):
        raise HTTPException(status_code=409, detail="This contractor assignment already exists.")
    row = ContractorAssignment(
        company_id=company_id,
        main_contractor_id=data.main_contractor_id,
        sub_contractor_id=data.sub_contractor_id,
        site_id=data.site_id,
        start_date=data.start_date,
        end_date=data.end_date,
        notes=data.notes,
    )
    db.add(row)
    db.flush()
    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=current_user.id,
        action="contractor_assigned",
        entity_type="contractor_assignment",
        meta={"assignment_id": str(row.id)},
    )
    db.commit()
    db.refresh(row)
    return _assignment_to_read(db, row)


def _assignment_to_read(db: Session, row: ContractorAssignment) -> AssignmentRead:
    main_c = db.query(Contractor).filter(Contractor.id == row.main_contractor_id).first()
    sub_c = db.query(Contractor).filter(Contractor.id == row.sub_contractor_id).first()
    if not main_c or not sub_c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return AssignmentRead(
        id=row.id,
        company_id=row.company_id,
        main_contractor_id=row.main_contractor_id,
        sub_contractor_id=row.sub_contractor_id,
        site_id=row.site_id,
        start_date=row.start_date,
        end_date=row.end_date,
        notes=row.notes,
        created_at=row.created_at,
        main_contractor=ContractorListRead.model_validate(main_c),
        sub_contractor=ContractorListRead.model_validate(sub_c),
    )


def list_assignments(
    db: Session,
    company_id: int,
    main_contractor_id: UUID | None,
    sub_contractor_id: UUID | None,
    site_id: int | None,
) -> list[AssignmentRead]:
    q = db.query(ContractorAssignment).filter(ContractorAssignment.company_id == company_id)
    if main_contractor_id:
        q = q.filter(ContractorAssignment.main_contractor_id == main_contractor_id)
    if sub_contractor_id:
        q = q.filter(ContractorAssignment.sub_contractor_id == sub_contractor_id)
    if site_id is not None:
        q = q.filter(ContractorAssignment.site_id == site_id)
    rows = q.order_by(ContractorAssignment.created_at.desc()).all()
    return [_assignment_to_read(db, r) for r in rows]


def delete_assignment(db: Session, company_id: int, assignment_id: UUID, current_user: User) -> None:
    row = (
        db.query(ContractorAssignment)
        .filter(ContractorAssignment.id == assignment_id, ContractorAssignment.company_id == company_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")
    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=current_user.id,
        action="contractor_unassigned",
        entity_type="contractor_assignment",
        meta={"assignment_id": str(assignment_id)},
    )
    db.delete(row)
    db.commit()
