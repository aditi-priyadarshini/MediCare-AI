"""Local file storage for uploaded records.

Files are stored under random keys, never under user-supplied names, so a filename can
neither escape the storage root nor collide with another patient's file.
"""

import hashlib
import re
import uuid
from pathlib import Path

# Content is identified by magic bytes; the client-declared Content-Type is never trusted.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)
_KEY = re.compile(r"^[0-9a-f]{32}$")


def sniff_content_type(data: bytes) -> str | None:
    for magic, content_type in _SIGNATURES:
        if data.startswith(magic):
            return content_type
    return None


def safe_display_name(name: str | None, fallback: str = "upload") -> str:
    """Strip any path and control characters; keep the name for display only."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[\x00-\x1f\x7f\"<>|:*?]", "", base).strip(" .")
    return base[:120] or fallback


class LocalFileStore:
    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        if not _KEY.fullmatch(key):
            raise ValueError("invalid storage key")
        return self.root / key[:2] / key

    def save(self, data: bytes) -> tuple[str, str]:
        """Persist bytes; returns (key, sha256)."""
        key = uuid.uuid4().hex
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key, hashlib.sha256(data).hexdigest()

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
