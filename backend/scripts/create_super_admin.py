import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash, SUPER_ADMIN_ROLE

EMAIL = "superadmin@gmail.com"
PASSWORD = "11223344"

def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).first()
        pwd_hash = get_password_hash(PASSWORD)
        if user:
            user.role = SUPER_ADMIN_ROLE
            user.company_id = None
            user.password_hash = pwd_hash
            print(f"Updated existing user {EMAIL} to super_admin")
        else:
            user = User(
                email=EMAIL,
                password_hash=pwd_hash,
                full_name="Super Admin",
                role=SUPER_ADMIN_ROLE,
                company_id=None,
            )
            db.add(user)
            print(f"Created super_admin {EMAIL}")
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    main()
