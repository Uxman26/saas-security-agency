import os

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(_BACKEND_ROOT, "uploads")
LOGOS_DIR = os.path.join(UPLOADS_DIR, "logos")


def ensure_upload_dirs() -> None:
    os.makedirs(LOGOS_DIR, exist_ok=True)


def resolve_storage_path(path: str | None) -> str | None:
    if not path:
        return None
    if os.path.isfile(path):
        return path
    candidates = [path]
    if not os.path.isabs(path):
        candidates.extend(
            [
                os.path.join(_BACKEND_ROOT, path),
                os.path.join(UPLOADS_DIR, path),
                os.path.join(_BACKEND_ROOT, "uploads", path),
            ]
        )
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return None
