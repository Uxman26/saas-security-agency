from __future__ import annotations

import io
import os
from typing import BinaryIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

AVIF_EXT = ".avif"
AVIF_MIME = "image/avif"
IMAGE_INPUT_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"}


def is_image_filename(filename: str) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext in IMAGE_INPUT_EXT


def _load_image(raw: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise HTTPException(status_code=400, detail="Invalid image file") from e
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        return img.convert("RGBA")
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def encode_avif_bytes(raw: bytes, quality: int = 80) -> bytes:
    img = _load_image(raw)
    out = io.BytesIO()
    img.save(out, format="AVIF", quality=quality)
    return out.getvalue()


def save_bytes_as_avif(raw: bytes, dest_path: str, quality: int = 80) -> str:
    avif_path = os.path.splitext(dest_path)[0] + AVIF_EXT
    data = encode_avif_bytes(raw, quality=quality)
    with open(avif_path, "wb") as out:
        out.write(data)
    return avif_path


def save_upload_as_avif(file_obj: BinaryIO, dest_path_without_ext: str, quality: int = 80) -> tuple[str, str]:
    raw = file_obj.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    avif_path = save_bytes_as_avif(raw, dest_path_without_ext, quality=quality)
    return avif_path, AVIF_MIME


def avif_filename(original: str) -> str:
    base = os.path.splitext(os.path.basename(original or "image"))[0] or "image"
    return f"{base}{AVIF_EXT}"
