import os
import uuid

import aiofiles
from fastapi import HTTPException

from app.config import settings

_ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "pdf"}


async def save_screenshot(content: bytes, filename: str) -> str:
    """Save an already-read payment/refund proof screenshot to disk and return its
    path relative to `payment-screenshots/` (as stored in `screenshot_path`/
    `refund_screenshot_path`). Takes raw bytes (not UploadFile) so callers that also
    need to forward the same bytes elsewhere (e.g. the AI screenshot parser) can read
    the upload exactly once."""
    ext = (filename or "screenshot.jpg").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    saved_filename = f"{uuid.uuid4()}.{ext}"
    save_dir = os.path.join(settings.uploads_dir, "payment-screenshots")
    os.makedirs(save_dir, exist_ok=True)
    async with aiofiles.open(os.path.join(save_dir, saved_filename), "wb") as f:
        await f.write(content)

    return f"payment-screenshots/{saved_filename}"
