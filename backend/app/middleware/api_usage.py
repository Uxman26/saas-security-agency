from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.database import SessionLocal
from app.models import ApiUsageLog, User


class ApiUsageMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method == "OPTIONS" or request.url.path == "/" or request.url.path.startswith("/swagger"):
            return response
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            return response
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            uid = int(payload.get("sub"))
        except (JWTError, TypeError, ValueError):
            return response
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == uid).first()
            if user and user.company_id:
                db.add(
                    ApiUsageLog(
                        company_id=user.company_id,
                        path=request.url.path[:200],
                        method=request.method,
                    )
                )
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
        return response
