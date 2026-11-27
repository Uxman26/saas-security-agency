"""Per-module bulk export / import for Sites, Staff, Clients, Contractors, Sub-contractors.

Each module has its own column map and duplicate key. Imports are insert-only by
default; ``update_existing`` must be explicitly enabled and requires edit rights.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable, Optional
from uuid import UUID

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from app.contractor_schemas import ContractorCreate, ContractorUpdate
from app.models import Client, Company, Contractor, Guard, MainContractor, Site, SubContractor, User
from app.schemas import ClientCreate, GuardCreate, SiteCreate, SubContractorCreate
from app.services import (
    audit_service,
    client_service,
    contractor_service,
    guard_service,
    site_service,
    soft_delete,
    sub_contractor_service,
)
from app.services.company_service import get_company_by_user_id
from app.services.export_service import to_csv, to_xlsx

MAX_IMPORT_ROWS = 5000
MAX_EXPORT_ROWS = 20000

MODULES = ("sites", "guards", "clients", "contractors", "sub_contractors")


@dataclass
class Col:
    key: str
    header: str
    required: bool = False
    example: str = ""


@dataclass
class ModuleSpec:
    module: str
    entity_type: str
    label: str
    columns: list[Col]
    # Export/import permission module key (matches module_actions).
    perm_module: str


def _cols(*items: tuple) -> list[Col]:
    out: list[Col] = []
    for item in items:
        if len(item) == 2:
            out.append(Col(item[0], item[1]))
        elif len(item) == 3:
            out.append(Col(item[0], item[1], bool(item[2])))
        else:
            out.append(Col(item[0], item[1], bool(item[2]), str(item[3])))
    return out


SITE_SPEC = ModuleSpec(
    module="sites",
    entity_type="site",
    label="Sites",
    perm_module="sites",
    columns=_cols(
        ("id", "id", False, ""),
        ("name", "name", True, "Yotel Hotel"),
        ("client_name", "client_name", False, "Acme Client"),
        ("address", "address", False, "123 High Street"),
        ("town_city", "town_city", False, "London"),
        ("postcode", "postcode", False, "E15 2AB"),
        ("contact_person", "contact_person", False, "Jane Doe"),
        ("contact_email", "contact_email", False, "jane@example.com"),
        ("contact_phone", "contact_phone", False, "+441234567890"),
        ("contract_start_date", "contract_start_date", False, "2024-01-01"),
        ("contract_end_date", "contract_end_date", False, "2025-12-31"),
        ("site_type", "site_type", False, "1"),
        ("reference", "reference", False, ""),
        ("default_hourly_rate", "default_hourly_rate", False, "18.50"),
        ("staff_hourly_rate", "staff_hourly_rate", False, "14.00"),
        ("latitude", "latitude", False, "51.5074"),
        ("longitude", "longitude", False, "-0.1278"),
        ("geofence_radius_m", "geofence_radius_m", False, "150"),
        ("contractor_name", "contractor_name", False, "Main Co"),
        ("assignment_instructions", "assignment_instructions", False, "• Report to reception"),
        ("color", "color", False, "#3b82f6"),
    ),
)

GUARD_SPEC = ModuleSpec(
    module="guards",
    entity_type="guard",
    label="Staff",
    perm_module="guards",
    columns=_cols(
        ("id", "id", False, ""),
        ("first_name", "first_name", True, "Muhammad"),
        ("last_name", "last_name", True, "Ali"),
        ("email", "email", False, "staff@example.com"),
        ("phone", "phone", False, "+447700900123"),
        ("job_title", "job_title", False, "Security Officer"),
        ("sia_number", "sia_number", False, "123456789012"),
        ("sia_expiry_date", "sia_expiry_date", False, "2027-01-01"),
        ("employment_start_date", "employment_start_date", False, "2024-06-01"),
        ("address_line_1", "address_line_1", False, "10 King Street"),
        ("town_city", "town_city", False, "London"),
        ("postcode", "postcode", False, "E1 1AA"),
        ("hourly_rate", "hourly_rate", False, "14.50"),
        ("badge_number", "badge_number", False, "B-100"),
        ("ni_number", "ni_number", False, "QQ123456C"),
        ("contractor_name", "contractor_name", False, "Main Co"),
        ("weekly_contracted_hours", "weekly_contracted_hours", False, "40"),
        ("pay_frequency", "pay_frequency", False, "weekly"),
        ("employee_type", "employee_type", False, "fixed"),
    ),
)

CLIENT_SPEC = ModuleSpec(
    module="clients",
    entity_type="client",
    label="Clients",
    perm_module="clients",
    columns=_cols(
        ("id", "id", False, ""),
        ("name", "name", True, "Acme Client Ltd"),
        ("email", "email", False, "billing@acme.example"),
        ("phone", "phone", False, "+441234567890"),
        ("address", "address", False, "1 Client Road"),
        ("town_city", "town_city", False, "London"),
        ("postcode", "postcode", False, "EC1A 1BB"),
        ("contact_person", "contact_person", False, "Alex Client"),
        ("contract_start_date", "contract_start_date", False, "2024-01-01"),
        ("contract_end_date", "contract_end_date", False, "2025-12-31"),
        ("double_rate_special_days", "double_rate_special_days", False, "false"),
    ),
)

CONTRACTOR_SPEC = ModuleSpec(
    module="contractors",
    entity_type="contractor",
    label="Contractors",
    perm_module="contractors",
    columns=_cols(
        ("id", "id", False, ""),
        ("name", "name", True, "Alpha Security"),
        ("type", "type", True, "main"),
        ("contact_email", "contact_email", False, "ops@alpha.example"),
        ("contact_phone", "contact_phone", False, "+441234567890"),
        ("address", "address", False, "2 Contractor Way"),
        ("town_city", "town_city", False, "London"),
        ("postcode", "postcode", False, "N1 9GU"),
        ("is_active", "is_active", False, "true"),
    ),
)

SUB_CONTRACTOR_SPEC = ModuleSpec(
    module="sub_contractors",
    entity_type="sub_contractor",
    label="Sub-contractors",
    perm_module="sub_contractors",
    columns=_cols(
        ("id", "id", False, ""),
        ("name", "name", True, "Beta Cover Ltd"),
        ("main_contractor_name", "main_contractor_name", True, "Alpha Security"),
        ("contact_person", "contact_person", False, "Sam Beta"),
        ("phone", "phone", False, "+441234567890"),
        ("email", "email", False, "sam@beta.example"),
        ("address", "address", False, "5 Sub Road"),
        ("town_city", "town_city", False, "London"),
        ("postcode", "postcode", False, "SE1 7PB"),
        ("registration_number", "registration_number", False, "REG-001"),
        ("contract_start_date", "contract_start_date", False, "2024-01-01"),
        ("contract_end_date", "contract_end_date", False, "2025-12-31"),
        ("status", "status", False, "active"),
    ),
)

SPECS: dict[str, ModuleSpec] = {
    s.module: s
    for s in (SITE_SPEC, GUARD_SPEC, CLIENT_SPEC, CONTRACTOR_SPEC, SUB_CONTRACTOR_SPEC)
}


def get_spec(module: str) -> ModuleSpec:
    key = (module or "").strip().lower()
    if key == "staff":
        key = "guards"
    if key not in SPECS:
        raise HTTPException(status_code=404, detail=f"Unknown bulk module: {module}")
    return SPECS[key]


def _as_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, UUID):
        return str(v)
    return str(v).strip()


def _parse_bool(raw: str) -> Optional[bool]:
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s in ("1", "true", "yes", "y"):
        return True
    if s in ("0", "false", "no", "n"):
        return False
    raise ValueError("must be true/false")


def _parse_date(raw: str) -> Optional[date]:
    s = (raw or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError("use YYYY-MM-DD")


def _parse_float(raw: str) -> Optional[float]:
    s = (raw or "").strip()
    if not s:
        return None
    return float(s)


def _parse_int(raw: str) -> Optional[int]:
    s = (raw or "").strip()
    if not s:
        return None
    return int(float(s))


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (h or "").strip().lower()).strip("_")


def _header_map(spec: ModuleSpec) -> dict[str, str]:
    """Map normalised header → field key."""
    m: dict[str, str] = {}
    for c in spec.columns:
        m[_norm_header(c.key)] = c.key
        m[_norm_header(c.header)] = c.key
    return m


def _company(db: Session, user: User) -> Company:
    return get_company_by_user_id(db, user.id)


def _client_by_name(db: Session, company_id: int, name: str) -> Optional[Client]:
    n = name.strip().lower()
    if not n:
        return None
    rows = soft_delete.apply_view(db.query(Client).filter(Client.company_id == company_id), Client).all()
    for r in rows:
        if (r.name or "").strip().lower() == n:
            return r
    return None


def _contractor_by_name(db: Session, company_id: int, name: str) -> Optional[Contractor]:
    n = name.strip().lower()
    if not n:
        return None
    rows = soft_delete.apply_view(
        db.query(Contractor).filter(Contractor.company_id == company_id), Contractor
    ).all()
    for r in rows:
        if (r.name or "").strip().lower() == n:
            return r
    return None


def _main_contractor_by_name(db: Session, company_id: int, name: str) -> Optional[MainContractor]:
    n = name.strip().lower()
    if not n:
        return None
    rows = soft_delete.apply_view(
        db.query(MainContractor).filter(MainContractor.company_id == company_id), MainContractor
    ).all()
    for r in rows:
        if (r.name or "").strip().lower() == n:
            return r
    return None


# --- Export row builders ------------------------------------------------------------

def _site_rows(db: Session, company: Company, ids: Optional[list[int]]) -> list[dict[str, Any]]:
    q = soft_delete.apply_view(db.query(Site).filter(Site.company_id == company.id), Site)
    if ids:
        q = q.filter(Site.id.in_(ids))
    rows = q.order_by(Site.name.asc()).limit(MAX_EXPORT_ROWS).all()
    clients = {c.id: c.name for c in soft_delete.apply_view(db.query(Client).filter(Client.company_id == company.id), Client)}
    contractors = {
        str(c.id): c.name
        for c in soft_delete.apply_view(db.query(Contractor).filter(Contractor.company_id == company.id), Contractor)
    }
    out = []
    for s in rows:
        out.append(
            {
                "id": s.id,
                "name": s.name,
                "client_name": clients.get(s.client_id) if s.client_id else "",
                "address": s.address,
                "town_city": s.town_city,
                "postcode": s.postcode,
                "contact_person": s.contact_person,
                "contact_email": s.contact_email,
                "contact_phone": s.contact_phone,
                "contract_start_date": s.contract_start_date,
                "contract_end_date": s.contract_end_date,
                "site_type": s.site_type,
                "reference": s.reference,
                "default_hourly_rate": s.default_hourly_rate,
                "staff_hourly_rate": s.staff_hourly_rate,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "geofence_radius_m": s.geofence_radius_m,
                "contractor_name": contractors.get(str(s.contractor_id)) if s.contractor_id else "",
                "assignment_instructions": s.assignment_instructions,
                "color": s.color,
            }
        )
    return out


def _guard_rows(db: Session, company: Company, ids: Optional[list[int]]) -> list[dict[str, Any]]:
    q = soft_delete.apply_view(db.query(Guard).filter(Guard.company_id == company.id), Guard)
    if ids:
        q = q.filter(Guard.id.in_(ids))
    rows = q.order_by(Guard.full_name.asc()).limit(MAX_EXPORT_ROWS).all()
    contractors = {
        str(c.id): c.name
        for c in soft_delete.apply_view(db.query(Contractor).filter(Contractor.company_id == company.id), Contractor)
    }
    out = []
    for g in rows:
        out.append(
            {
                "id": g.id,
                "first_name": g.first_name,
                "last_name": g.last_name,
                "email": g.email,
                "phone": g.phone,
                "job_title": g.job_title,
                "sia_number": g.sia_number,
                "sia_expiry_date": g.sia_expiry_date,
                "employment_start_date": g.employment_start_date,
                "address_line_1": g.address_line_1,
                "town_city": g.town_city,
                "postcode": g.postcode,
                "hourly_rate": g.hourly_rate,
                "badge_number": g.badge_number,
                "ni_number": g.ni_number,
                "contractor_name": contractors.get(str(g.contractor_id)) if g.contractor_id else "",
                "weekly_contracted_hours": g.weekly_contracted_hours,
                "pay_frequency": g.pay_frequency,
                "employee_type": g.employee_type,
            }
        )
    return out


def _client_rows(db: Session, company: Company, ids: Optional[list[int]]) -> list[dict[str, Any]]:
    q = soft_delete.apply_view(db.query(Client).filter(Client.company_id == company.id), Client)
    if ids:
        q = q.filter(Client.id.in_(ids))
    rows = q.order_by(Client.name.asc()).limit(MAX_EXPORT_ROWS).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "phone": c.phone,
            "address": c.address,
            "town_city": getattr(c, "town_city", None),
            "postcode": c.postcode,
            "contact_person": c.contact_person,
            "contract_start_date": c.contract_start_date,
            "contract_end_date": c.contract_end_date,
            "double_rate_special_days": bool(getattr(c, "double_rate_special_days", False)),
        }
        for c in rows
    ]


def _contractor_rows(db: Session, company: Company, ids: Optional[list[str]]) -> list[dict[str, Any]]:
    q = soft_delete.apply_view(db.query(Contractor).filter(Contractor.company_id == company.id), Contractor)
    if ids:
        try:
            uuids = [UUID(x) for x in ids]
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid contractor id list") from exc
        q = q.filter(Contractor.id.in_(uuids))
    rows = q.order_by(Contractor.name.asc()).limit(MAX_EXPORT_ROWS).all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "type": c.type.value if hasattr(c.type, "value") else c.type,
            "contact_email": c.contact_email,
            "contact_phone": c.contact_phone,
            "address": c.address,
            "town_city": c.town_city,
            "postcode": c.postcode,
            "is_active": bool(c.is_active),
        }
        for c in rows
    ]


def _sub_contractor_rows(db: Session, company: Company, ids: Optional[list[int]]) -> list[dict[str, Any]]:
    q = soft_delete.apply_view(
        db.query(SubContractor).filter(SubContractor.company_id == company.id), SubContractor
    )
    if ids:
        q = q.filter(SubContractor.id.in_(ids))
    rows = q.order_by(SubContractor.name.asc()).limit(MAX_EXPORT_ROWS).all()
    mains = {
        m.id: m.name
        for m in db.query(MainContractor).filter(MainContractor.company_id == company.id).all()
    }
    return [
        {
            "id": s.id,
            "name": s.name,
            "main_contractor_name": mains.get(s.main_contractor_id) if s.main_contractor_id else "",
            "contact_person": s.contact_person,
            "phone": s.phone,
            "email": s.email,
            "address": s.address,
            "town_city": getattr(s, "town_city", None),
            "postcode": getattr(s, "postcode", None),
            "registration_number": getattr(s, "registration_number", None) or getattr(s, "license_number", None),
            "contract_start_date": s.contract_start_date,
            "contract_end_date": s.contract_end_date,
            "status": s.status,
        }
        for s in rows
    ]


_EXPORTERS: dict[str, Callable] = {
    "sites": _site_rows,
    "guards": _guard_rows,
    "clients": _client_rows,
    "contractors": _contractor_rows,
    "sub_contractors": _sub_contractor_rows,
}


def export_bytes(
    db: Session,
    user: User,
    module: str,
    *,
    fmt: str = "xlsx",
    ids: Optional[list[Any]] = None,
) -> tuple[bytes, str, str]:
    spec = get_spec(module)
    company = _company(db, user)
    rows_raw = _EXPORTERS[spec.module](db, company, ids)
    rows = [{k: _as_str(v) for k, v in r.items()} for r in rows_raw]
    columns = [(c.key, c.header) for c in spec.columns]
    fmt = (fmt or "xlsx").lower()
    if fmt == "csv":
        body = to_csv(rows, columns)
        media = "text/csv"
        ext = "csv"
    elif fmt == "xlsx":
        body = to_xlsx(rows, columns, spec.label)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    else:
        raise HTTPException(status_code=422, detail="format must be csv or xlsx")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="bulk_export",
        entity_type=spec.entity_type,
        meta={"module": spec.module, "format": fmt, "count": len(rows), "selected": bool(ids)},
    )
    db.commit()
    filename = f"{spec.module}-export-{date.today().isoformat()}.{ext}"
    return body, media, filename


def template_bytes(module: str, fmt: str = "xlsx") -> tuple[bytes, str, str]:
    spec = get_spec(module)
    example = {c.key: c.example for c in spec.columns}
    columns = [(c.key, c.header) for c in spec.columns]
    fmt = (fmt or "xlsx").lower()
    if fmt == "csv":
        body = to_csv([example], columns)
        media = "text/csv"
        ext = "csv"
    else:
        body = to_xlsx([example], columns, f"{spec.label} template")
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    return body, media, f"{spec.module}-import-template.{ext}"


def _read_upload(file: UploadFile) -> list[dict[str, str]]:
    name = (file.filename or "").lower()
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Empty file")
    if name.endswith(".csv") or (file.content_type or "").endswith("csv"):
        text = raw.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise HTTPException(status_code=422, detail="CSV has no header row")
        return [{k: (v or "").strip() if v is not None else "" for k, v in row.items()} for row in reader]
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            headers = next(rows_iter)
        except StopIteration as exc:
            raise HTTPException(status_code=422, detail="Spreadsheet is empty") from exc
        headers = [str(h or "").strip() for h in headers]
        out: list[dict[str, str]] = []
        for row in rows_iter:
            if row is None or all(c is None or str(c).strip() == "" for c in row):
                continue
            item = {}
            for i, h in enumerate(headers):
                if not h:
                    continue
                val = row[i] if i < len(row) else ""
                if isinstance(val, datetime):
                    val = val.date().isoformat()
                elif isinstance(val, date):
                    val = val.isoformat()
                item[h] = "" if val is None else str(val).strip()
            out.append(item)
        return out
    raise HTTPException(status_code=422, detail="Upload a .csv or .xlsx file")


def _normalise_rows(spec: ModuleSpec, raw_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    hmap = _header_map(spec)
    out: list[dict[str, str]] = []
    for raw in raw_rows:
        mapped: dict[str, str] = {c.key: "" for c in spec.columns}
        for k, v in raw.items():
            key = hmap.get(_norm_header(k))
            if key:
                mapped[key] = (v or "").strip()
        if any(mapped[c.key] for c in spec.columns if c.key != "id"):
            out.append(mapped)
    if len(out) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=422, detail=f"Import limited to {MAX_IMPORT_ROWS} rows")
    return out


# --- Validation / apply per module --------------------------------------------------

def _validate_site_row(db: Session, company: Company, row: dict[str, str], errors: list[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    name = row.get("name", "").strip()
    if not name:
        errors.append("name is required")
    payload["name"] = name
    for key in ("address", "town_city", "postcode", "contact_person", "contact_phone", "reference", "assignment_instructions", "color"):
        if row.get(key):
            payload[key] = row[key]
    if row.get("contact_email"):
        payload["contact_email"] = row["contact_email"]
    try:
        if row.get("contract_start_date"):
            payload["contract_start_date"] = _parse_date(row["contract_start_date"])
        if row.get("contract_end_date"):
            payload["contract_end_date"] = _parse_date(row["contract_end_date"])
        if row.get("default_hourly_rate"):
            payload["default_hourly_rate"] = _parse_float(row["default_hourly_rate"])
        if row.get("staff_hourly_rate"):
            payload["staff_hourly_rate"] = _parse_float(row["staff_hourly_rate"])
        if row.get("latitude"):
            payload["latitude"] = _parse_float(row["latitude"])
        if row.get("longitude"):
            payload["longitude"] = _parse_float(row["longitude"])
        if row.get("geofence_radius_m"):
            payload["geofence_radius_m"] = _parse_float(row["geofence_radius_m"])
        if row.get("site_type"):
            payload["site_type"] = _parse_int(row["site_type"]) or 1
        else:
            payload["site_type"] = 1
    except ValueError as e:
        errors.append(str(e))
    client_name = row.get("client_name", "").strip()
    if client_name:
        client = _client_by_name(db, company.id, client_name)
        if not client:
            errors.append(f"client_name not found: {client_name}")
        else:
            payload["client_id"] = client.id
    contractor_name = row.get("contractor_name", "").strip()
    if contractor_name:
        c = _contractor_by_name(db, company.id, contractor_name)
        if not c:
            errors.append(f"contractor_name not found: {contractor_name}")
        else:
            payload["contractor_id"] = c.id
    return payload


def _find_site_dup(db: Session, company_id: int, name: str) -> Optional[Site]:
    n = name.strip().lower()
    for s in soft_delete.apply_view(db.query(Site).filter(Site.company_id == company_id), Site):
        if (s.name or "").strip().lower() == n:
            return s
    return None


def _validate_guard_row(db: Session, company: Company, row: dict[str, str], errors: list[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "first_name": row.get("first_name", "").strip(),
        "last_name": row.get("last_name", "").strip(),
    }
    if not payload["first_name"] or not payload["last_name"]:
        errors.append("first_name and last_name are required")
    for key in (
        "email", "phone", "job_title", "sia_number", "address_line_1", "town_city", "postcode",
        "badge_number", "ni_number", "pay_frequency", "employee_type",
    ):
        if row.get(key):
            payload[key] = row[key]
    try:
        if row.get("sia_expiry_date"):
            payload["sia_expiry_date"] = _parse_date(row["sia_expiry_date"])
        if row.get("employment_start_date"):
            payload["employment_start_date"] = _parse_date(row["employment_start_date"])
        if row.get("hourly_rate"):
            payload["hourly_rate"] = _parse_float(row["hourly_rate"])
        if row.get("weekly_contracted_hours"):
            payload["weekly_contracted_hours"] = _parse_float(row["weekly_contracted_hours"])
    except ValueError as e:
        errors.append(str(e))
    contractor_name = row.get("contractor_name", "").strip()
    if contractor_name:
        c = _contractor_by_name(db, company.id, contractor_name)
        if not c:
            errors.append(f"contractor_name not found: {contractor_name}")
        else:
            payload["contractor_id"] = c.id
    return payload


def _find_guard_dup(db: Session, company_id: int, payload: dict[str, Any]) -> Optional[Guard]:
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    sia = (payload.get("sia_number") or "").strip()
    badge = (payload.get("badge_number") or "").strip()
    q = soft_delete.apply_view(db.query(Guard).filter(Guard.company_id == company_id), Guard)
    rows = q.all()
    for g in rows:
        if email and (g.email or "").strip().lower() == email:
            return g
        if phone and (g.phone or "").strip() == phone:
            return g
        if sia and (g.sia_number or "").strip() == sia:
            return g
        if badge and (g.badge_number or "").strip() == badge:
            return g
    if badge:
        other = (
            soft_delete.apply_view(db.query(Guard).filter(Guard.badge_number == badge), Guard)
            .filter(Guard.company_id != company_id)
            .first()
        )
        if other:
            raise ValueError(f"badge_number already used by another company: {badge}")
    return None


def _validate_client_row(row: dict[str, str], errors: list[str]) -> dict[str, Any]:
    name = row.get("name", "").strip()
    if not name:
        errors.append("name is required")
    payload: dict[str, Any] = {"name": name}
    for key in ("email", "phone", "address", "town_city", "postcode", "contact_person"):
        if row.get(key):
            payload[key] = row[key]
    try:
        if row.get("contract_start_date"):
            payload["contract_start_date"] = _parse_date(row["contract_start_date"])
        if row.get("contract_end_date"):
            payload["contract_end_date"] = _parse_date(row["contract_end_date"])
        if row.get("double_rate_special_days"):
            payload["double_rate_special_days"] = _parse_bool(row["double_rate_special_days"]) or False
    except ValueError as e:
        errors.append(str(e))
    return payload


def _find_client_dup(db: Session, company_id: int, name: str) -> Optional[Client]:
    return _client_by_name(db, company_id, name)


def _validate_contractor_row(row: dict[str, str], errors: list[str]) -> dict[str, Any]:
    name = row.get("name", "").strip()
    typ = row.get("type", "").strip().lower()
    if not name:
        errors.append("name is required")
    if typ not in ("main", "sub"):
        errors.append("type must be main or sub")
    payload: dict[str, Any] = {"name": name, "type": typ}
    for key in ("contact_email", "contact_phone", "address", "town_city", "postcode"):
        if row.get(key):
            payload[key] = row[key]
    try:
        if row.get("is_active"):
            payload["is_active"] = _parse_bool(row["is_active"])
    except ValueError as e:
        errors.append(str(e))
    return payload


def _find_contractor_dup(db: Session, company_id: int, name: str, typ: str) -> Optional[Contractor]:
    n = name.strip().lower()
    for c in soft_delete.apply_view(db.query(Contractor).filter(Contractor.company_id == company_id), Contractor):
        ctype = c.type.value if hasattr(c.type, "value") else str(c.type)
        if (c.name or "").strip().lower() == n and ctype == typ:
            return c
    return None


def _validate_sub_row(db: Session, company: Company, row: dict[str, str], errors: list[str]) -> dict[str, Any]:
    name = row.get("name", "").strip()
    main_name = row.get("main_contractor_name", "").strip()
    if not name:
        errors.append("name is required")
    if not main_name:
        errors.append("main_contractor_name is required")
    payload: dict[str, Any] = {"name": name}
    for key in ("contact_person", "phone", "email", "address", "town_city", "postcode", "registration_number", "status"):
        if row.get(key):
            payload[key] = row[key]
    try:
        if row.get("contract_start_date"):
            payload["contract_start_date"] = _parse_date(row["contract_start_date"])
        if row.get("contract_end_date"):
            payload["contract_end_date"] = _parse_date(row["contract_end_date"])
    except ValueError as e:
        errors.append(str(e))
    main = _main_contractor_by_name(db, company.id, main_name) if main_name else None
    if main_name and not main:
        errors.append(f"main_contractor_name not found: {main_name}")
    elif main:
        payload["main_contractor_id"] = main.id
    return payload


def _find_sub_dup(db: Session, company_id: int, name: str, main_id: Optional[int]) -> Optional[SubContractor]:
    n = name.strip().lower()
    q = soft_delete.apply_view(db.query(SubContractor).filter(SubContractor.company_id == company_id), SubContractor)
    for s in q:
        if (s.name or "").strip().lower() == n and (main_id is None or s.main_contractor_id == main_id):
            return s
    return None


def _preview_from_rows(
    db: Session,
    company: Company,
    spec: ModuleSpec,
    rows: list[dict[str, str]],
    *,
    update_existing: bool,
) -> dict[str, Any]:
    preview_rows: list[dict[str, Any]] = []
    valid = invalid = duplicate = 0
    for i, row in enumerate(rows, start=2):
        errors: list[str] = []
        status = "valid"
        existing_id = None
        payload: dict[str, Any] = {}
        dup = None
        try:
            if spec.module == "sites":
                payload = _validate_site_row(db, company, row, errors)
                if not errors:
                    SiteCreate(**{**payload, "create_login": False})
                dup = _find_site_dup(db, company.id, row.get("name", "")) if row.get("name") else None
            elif spec.module == "guards":
                payload = _validate_guard_row(db, company, row, errors)
                if not errors:
                    GuardCreate(**{**payload, "create_login": False})
                dup = _find_guard_dup(db, company.id, payload) if payload.get("first_name") else None
            elif spec.module == "clients":
                payload = _validate_client_row(row, errors)
                if not errors:
                    ClientCreate(**{**payload, "create_login": False})
                dup = _find_client_dup(db, company.id, row.get("name", "")) if row.get("name") else None
            elif spec.module == "contractors":
                payload = _validate_contractor_row(row, errors)
                if not errors:
                    ContractorCreate(**payload)
                dup = (
                    _find_contractor_dup(db, company.id, row.get("name", ""), row.get("type", "").strip().lower())
                    if row.get("name") and row.get("type")
                    else None
                )
            else:
                payload = _validate_sub_row(db, company, row, errors)
                if not errors:
                    SubContractorCreate(**payload)
                dup = (
                    _find_sub_dup(db, company.id, row.get("name", ""), payload.get("main_contractor_id"))
                    if row.get("name")
                    else None
                )
        except Exception as e:
            errors.append(str(e))
            dup = None

        if errors:
            status = "invalid"
            invalid += 1
        elif dup:
            existing_id = str(getattr(dup, "id", ""))
            duplicate += 1
            if update_existing:
                status = "update"
                valid += 1
            else:
                status = "duplicate"
                errors.append("Matching record already exists (will be skipped unless update is enabled)")
        else:
            valid += 1

        preview_rows.append(
            {
                "row": i,
                "status": status,
                "errors": errors,
                "existing_id": existing_id,
                "data": row,
            }
        )

    return {
        "module": spec.module,
        "label": spec.label,
        "update_existing": update_existing,
        "total": len(preview_rows),
        "valid": valid,
        "invalid": invalid,
        "duplicate": duplicate,
        "policy": (
            "Valid rows will be created. Duplicate rows are skipped unless “Update existing records” is enabled. "
            "Invalid rows are never imported."
        ),
        "rows": preview_rows,
    }


def preview_import(
    db: Session,
    user: User,
    module: str,
    file: UploadFile,
    *,
    update_existing: bool = False,
) -> dict[str, Any]:
    spec = get_spec(module)
    company = _company(db, user)
    rows = _normalise_rows(spec, _read_upload(file))
    return _preview_from_rows(db, company, spec, rows, update_existing=update_existing)


def commit_import(
    db: Session,
    user: User,
    module: str,
    file: UploadFile,
    *,
    update_existing: bool = False,
) -> dict[str, Any]:
    spec = get_spec(module)
    company = _company(db, user)
    try:
        file.file.seek(0)
    except Exception:
        pass
    rows = _normalise_rows(spec, _read_upload(file))
    preview = _preview_from_rows(db, company, spec, rows, update_existing=update_existing)
    created = updated = skipped = failed = 0
    results: list[dict[str, Any]] = []

    for item in preview["rows"]:
        status = item["status"]
        row = item["data"]
        errors = list(item["errors"])
        try:
            if status == "invalid":
                failed += 1
                results.append({"row": item["row"], "status": "failed", "errors": errors})
                continue
            if status == "duplicate":
                skipped += 1
                results.append({"row": item["row"], "status": "skipped", "errors": errors})
                continue

            if spec.module == "sites":
                payload = _validate_site_row(db, company, row, [])
                body = SiteCreate(**{**payload, "create_login": False})
                if status == "update" and item.get("existing_id"):
                    site_service.update_site(db, int(item["existing_id"]), body, user.id)
                    updated += 1
                    results.append({"row": item["row"], "status": "updated", "id": item["existing_id"]})
                else:
                    created_row = site_service.create_site(db, body, user.id)
                    created += 1
                    results.append({"row": item["row"], "status": "created", "id": created_row.id})
            elif spec.module == "guards":
                payload = _validate_guard_row(db, company, row, [])
                body = GuardCreate(**{**payload, "create_login": False})
                if status == "update" and item.get("existing_id"):
                    guard_service.update_guard(db, int(item["existing_id"]), body, user.id)
                    updated += 1
                    results.append({"row": item["row"], "status": "updated", "id": item["existing_id"]})
                else:
                    created_row = guard_service.create_guard(db, body, user.id)
                    created += 1
                    results.append({"row": item["row"], "status": "created", "id": created_row.id})
            elif spec.module == "clients":
                payload = _validate_client_row(row, [])
                body = ClientCreate(**{**payload, "create_login": False})
                if status == "update" and item.get("existing_id"):
                    client_service.update_client(db, int(item["existing_id"]), body, user.id)
                    updated += 1
                    results.append({"row": item["row"], "status": "updated", "id": item["existing_id"]})
                else:
                    created_row = client_service.create_client(db, body, user.id)
                    created += 1
                    results.append({"row": item["row"], "status": "created", "id": created_row.id})
            elif spec.module == "contractors":
                payload = _validate_contractor_row(row, [])
                if status == "update" and item.get("existing_id"):
                    upd = ContractorUpdate(**payload)
                    contractor_service.update_contractor(db, company.id, UUID(item["existing_id"]), upd, user)
                    updated += 1
                    results.append({"row": item["row"], "status": "updated", "id": item["existing_id"]})
                else:
                    created_row = contractor_service.create_contractor(
                        db, company.id, ContractorCreate(**{k: v for k, v in payload.items() if k != "is_active"}), user
                    )
                    created += 1
                    results.append({"row": item["row"], "status": "created", "id": str(created_row.id)})
            else:
                payload = _validate_sub_row(db, company, row, [])
                body = SubContractorCreate(**payload)
                if status == "update" and item.get("existing_id"):
                    sub_contractor_service.update_sub_contractor(db, int(item["existing_id"]), body, user.id)
                    updated += 1
                    results.append({"row": item["row"], "status": "updated", "id": item["existing_id"]})
                else:
                    created_row = sub_contractor_service.create_sub_contractor(db, body, user.id)
                    created += 1
                    results.append({"row": item["row"], "status": "created", "id": created_row.id})
        except Exception as e:
            failed += 1
            results.append({"row": item["row"], "status": "failed", "errors": [str(e)]})

    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="bulk_import",
        entity_type=spec.entity_type,
        meta={
            "module": spec.module,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "update_existing": update_existing,
        },
    )
    db.commit()
    return {
        "module": spec.module,
        "label": spec.label,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "duplicate": preview["duplicate"],
        "results": results,
    }
