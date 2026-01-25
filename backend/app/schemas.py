from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str
    company_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class CompanyBase(BaseModel):
    name: str

class CompanyResponse(CompanyBase):
    id: int
    admin_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class GuardBase(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    badge_number: Optional[str] = None
    license_number: Optional[str] = None
    address: Optional[str] = None

class GuardCreate(GuardBase):
    pass

class GuardResponse(GuardBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class SiteBase(BaseModel):
    name: str
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None

class SiteCreate(SiteBase):
    pass

class SiteResponse(SiteBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class AssignmentBase(BaseModel):
    guard_id: int
    site_id: int
    date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None

class AssignmentCreate(AssignmentBase):
    pass

class AssignmentResponse(AssignmentBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class RotaResponse(BaseModel):
    guard_id: int
    guard_name: str
    site_id: int
    site_name: str
    date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    
    class Config:
        from_attributes = True

class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class SubContractorBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    license_number: Optional[str] = None

class SubContractorCreate(SubContractorBase):
    pass

class SubContractorResponse(SubContractorBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
