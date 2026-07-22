from __future__ import annotations

import re
from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationInfo, field_validator


class ContractorTypeSchema(str, Enum):
    main = "main"
    sub = "sub"


class ContractorCreate(BaseModel):
    name: str = Field(..., max_length=120)
    type: ContractorTypeSchema
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = Field(None, max_length=500)
    postcode: Optional[str] = Field(None, max_length=20)

    @field_validator("name")
    @classmethod
    def name_strip(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("name required")
        return s[:120]

    @field_validator("contact_phone")
    @classmethod
    def phone_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        s = str(v).strip()
        if not re.fullmatch(r"\+[0-9]{7,15}", s):
            raise ValueError("Invalid phone number")
        return s


class ContractorUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    type: Optional[ContractorTypeSchema] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = Field(None, max_length=500)
    postcode: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def name_strip(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("name cannot be empty")
        return s[:120]

    @field_validator("contact_phone")
    @classmethod
    def phone_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        s = str(v).strip()
        if not re.fullmatch(r"\+[0-9]{7,15}", s):
            raise ValueError("Invalid phone number")
        return s


class ContractorListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: UUID
    name: str
    type: ContractorTypeSchema
    is_active: bool
    contact_email: Optional[str] = None


class ContractorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: UUID
    company_id: int
    name: str
    type: ContractorTypeSchema
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", mode="before")
    @classmethod
    def created_at_fallback(cls, v):
        if v is not None:
            return v
        return datetime.now(timezone.utc)

    @field_validator("updated_at", mode="before")
    @classmethod
    def updated_at_fallback(cls, v, info: ValidationInfo):
        if v is not None:
            return v
        c = info.data.get("created_at")
        if c is not None:
            return c
        return datetime.now(timezone.utc)


class AssignmentCreate(BaseModel):
    main_contractor_id: UUID
    sub_contractor_id: UUID
    site_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("notes")
    @classmethod
    def notes_strip(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return re.sub(r"[<>]", "", v.strip())[:2000] if v else None


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: UUID
    company_id: int
    main_contractor_id: UUID
    sub_contractor_id: UUID
    site_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    main_contractor: ContractorListRead
    sub_contractor: ContractorListRead
