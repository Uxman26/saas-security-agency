import os

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(_BACKEND_ROOT, "uploads")
LOGOS_DIR = os.path.join(UPLOADS_DIR, "logos")
EXPENSES_DIR = os.path.join(UPLOADS_DIR, "expenses")
DOCUMENTS_DIR = os.path.join(UPLOADS_DIR, "documents")
GUARD_PHOTOS_DIR = os.path.join(UPLOADS_DIR, "guard_photos")
PATROL_PHOTOS_DIR = os.path.join(UPLOADS_DIR, "patrol_photos")
INCIDENT_PHOTOS_DIR = os.path.join(UPLOADS_DIR, "incident_photos")


def ensure_upload_dirs() -> None:
    os.makedirs(LOGOS_DIR, exist_ok=True)
    os.makedirs(EXPENSES_DIR, exist_ok=True)
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    os.makedirs(GUARD_PHOTOS_DIR, exist_ok=True)
    os.makedirs(PATROL_PHOTOS_DIR, exist_ok=True)
    os.makedirs(INCIDENT_PHOTOS_DIR, exist_ok=True)


def resolve_storage_path(path: str | None) -> str | None:
    """Find a stored file, tolerating a path recorded under a different root.

    Rows written before a deployment change can hold an absolute path from the old
    layout (e.g. ``/app/uploads/logos/company_2.avif``). Rather than treating those as
    missing, fall back to the same ``<subdir>/<filename>`` under the current uploads
    directory, which is where the file actually lives.
    """
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
    else:
        # Keep the last two segments so the file is only ever looked for in the same
        # upload subdirectory it was written to — never across categories or tenants.
        parts = os.path.normpath(path).split(os.sep)
        if len(parts) >= 2:
            candidates.append(os.path.join(UPLOADS_DIR, parts[-2], parts[-1]))
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return None
