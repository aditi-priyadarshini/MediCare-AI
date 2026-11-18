"""Read the text out of an uploaded report, entirely on this server.

* A PDF with a text layer is read directly (no OCR needed, exact characters).
* A photo, or a PDF that is only pictures of pages, goes through Tesseract, a local program.
  No document, image or text is sent to any other service, and nothing is written to disk: the
  image is piped to Tesseract's stdin and its text is read back from stdout.

Everything here is bounded, because the input is an untrusted upload: a pixel cap (decompression
bombs), a page cap, a per-run timeout and a limit on how many scans run at once.
"""

import io
import shutil
import subprocess  # noqa: S404 - fixed argument list, no shell, see _ocr
import threading
from dataclasses import dataclass

MIN_TEXT_CHARS_PER_PAGE = 40  # below this a PDF page is treated as a picture
_RENDER_SCALE = 2.5  # PDF points -> pixels (about 180 dpi): enough for small print
_MIN_OCR_WIDTH = 1600  # smaller photos are enlarged before OCR
_MAX_OCR_WIDTH = 3600  # larger ones are reduced: more pixels do not read better, only slower
_LANG_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_+0123456789")


class ScanUnavailable(Exception):  # noqa: N818 - reads better than ScanUnavailableError
    """Scanning cannot run here (not installed, switched off) or could not read the file."""

    def __init__(self, message: str, code: str = "SCAN_UNAVAILABLE", status: int = 503):
        super().__init__(message)
        self.code, self.status = code, status


@dataclass(frozen=True)
class Extracted:
    text: str
    method: str  # "pdf_text" | "ocr" | "pdf_ocr"
    pages_read: int
    pages_total: int

    @property
    def truncated(self) -> bool:
        return self.pages_read < self.pages_total


@dataclass(frozen=True)
class ScanCapabilities:
    ocr: bool  # Tesseract and Pillow are available (photos and scanned PDFs)
    pdf_text: bool  # pypdf is available (PDFs with a text layer)
    pdf_ocr: bool  # pypdfium2 is available too (scanned PDFs)

    @property
    def available(self) -> bool:
        return self.ocr or self.pdf_text


_slots = threading.BoundedSemaphore(2)  # at most two scans per process at the same time


def _has(module: str) -> bool:
    try:
        __import__(module)
    except ImportError:
        return False
    return True


def capabilities(tesseract_cmd: str = "tesseract") -> ScanCapabilities:
    ocr = bool(shutil.which(tesseract_cmd)) and _has("PIL")
    return ScanCapabilities(
        ocr=ocr, pdf_text=_has("pypdf"), pdf_ocr=ocr and _has("pypdf") and _has("pypdfium2")
    )


def _ocr(png: bytes, *, cmd: str, languages: str, timeout: float) -> str:
    if not languages or not set(languages) <= _LANG_OK:
        raise ScanUnavailable("OCR languages are not configured correctly.")
    exe = shutil.which(cmd)
    if exe is None:
        raise ScanUnavailable("Text recognition is not installed on this server.")
    try:
        # Fixed argument list, no shell. "--psm 6" keeps table rows on one line, which is what a
        # lab report is. The image goes in on stdin and the text comes back on stdout.
        done = subprocess.run(  # noqa: S603
            [exe, "stdin", "stdout", "-l", languages, "--psm", "6"],
            input=png,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ScanUnavailable(
            "Reading this file took too long. Try a smaller or clearer photo.",
            "SCAN_TIMEOUT",
            422,
        ) from exc
    if done.returncode != 0:
        raise ScanUnavailable("The text could not be read from this image.", "SCAN_FAILED", 422)
    return done.stdout.decode("utf-8", errors="replace")


def _prepare(data: bytes, max_pixels: int) -> bytes:
    """Photo -> upright, grey, contrast-stretched PNG at a sensible size."""
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = max_pixels  # Pillow warns above this and raises above twice it
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.width * probe.height > max_pixels:
                raise ScanUnavailable(
                    "This image is too large to read. Use a smaller photo.", "IMAGE_TOO_LARGE", 413
                )
            img = ImageOps.exif_transpose(probe)  # phone photos carry their rotation in EXIF
            img = ImageOps.autocontrast(ImageOps.grayscale(img))
    except ScanUnavailable:
        raise
    except Exception as exc:  # Pillow raises several types for damaged or hostile files
        raise ScanUnavailable("This image could not be opened.", "IMAGE_UNREADABLE", 422) from exc
    if img.width < _MIN_OCR_WIDTH:
        factor = _MIN_OCR_WIDTH / img.width
        img = img.resize((_MIN_OCR_WIDTH, max(1, round(img.height * factor))), Image.LANCZOS)
    elif img.width > _MAX_OCR_WIDTH:
        factor = _MAX_OCR_WIDTH / img.width
        img = img.resize((_MAX_OCR_WIDTH, max(1, round(img.height * factor))), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def _pdf_pages_as_png(data: bytes, pages: list[int], max_pixels: int) -> list[bytes]:
    import pypdfium2 as pdfium

    out: list[bytes] = []
    pdf = pdfium.PdfDocument(data)
    try:
        for index in pages:
            page = pdf[index]
            width, height = page.get_size()
            scale = _RENDER_SCALE
            if width * height * scale * scale > max_pixels:  # a huge page is rendered smaller
                scale = max(0.5, (max_pixels / (width * height)) ** 0.5)
            buf = io.BytesIO()
            page.render(scale=scale).to_pil().save(buf, format="PNG")
            out.append(buf.getvalue())
    finally:
        pdf.close()
    return out


def extract_text(
    data: bytes,
    content_type: str,
    *,
    tesseract_cmd: str = "tesseract",
    languages: str = "eng",
    timeout: float = 45.0,
    max_pages: int = 5,
    max_pixels: int = 40_000_000,
) -> Extracted:
    """Text of an uploaded PDF, PNG or JPEG. Raises :class:`ScanUnavailable` when it cannot."""
    caps = capabilities(tesseract_cmd)
    if not _slots.acquire(blocking=False):
        raise ScanUnavailable("Scanning is busy. Try again in a moment.", "SCAN_BUSY", 429)
    try:
        if content_type == "application/pdf":
            return _from_pdf(data, caps, tesseract_cmd, languages, timeout, max_pages, max_pixels)
        if not caps.ocr:
            raise ScanUnavailable(
                "Reading photos is not available on this server. You can still type the details."
            )
        text = _ocr(
            _prepare(data, max_pixels), cmd=tesseract_cmd, languages=languages, timeout=timeout
        )
        return Extracted(text, "ocr", 1, 1)
    finally:
        _slots.release()


def _from_pdf(
    data: bytes,
    caps: ScanCapabilities,
    cmd: str,
    languages: str,
    timeout: float,
    max_pages: int,
    max_pixels: int,
) -> Extracted:
    if not caps.pdf_text:
        raise ScanUnavailable(
            "Reading PDFs is not available on this server. You can still type the details."
        )
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ScanUnavailable(
                "This PDF is password protected. Remove the password and try again.",
                "PDF_ENCRYPTED",
                422,
            )
        total = len(reader.pages)
        read = min(total, max_pages)
        texts = [(reader.pages[i].extract_text() or "") for i in range(read)]
    except ScanUnavailable:
        raise
    except (PyPdfError, ValueError, KeyError, RecursionError, OSError) as exc:
        raise ScanUnavailable("This PDF could not be read.", "PDF_UNREADABLE", 422) from exc

    enough = sum(len(t.strip()) for t in texts) >= MIN_TEXT_CHARS_PER_PAGE * max(1, read)
    if enough:
        return Extracted("\n".join(texts), "pdf_text", read, total)
    if not caps.pdf_ocr:
        # A PDF made of pictures and no way to read pictures: say so rather than return nothing.
        raise ScanUnavailable(
            "This PDF is made of page images and reading those is not available on this server. "
            "Upload a photo of the page instead, or type the details.",
            "PDF_NEEDS_OCR",
            422,
        )
    try:
        pngs = _pdf_pages_as_png(data, list(range(read)), max_pixels)
    except Exception as exc:  # pypdfium2 raises PdfiumError and others
        raise ScanUnavailable("This PDF could not be read.", "PDF_UNREADABLE", 422) from exc
    per_page = max(10.0, timeout / max(1, len(pngs)))  # one budget for the whole file
    parts = [_ocr(p, cmd=cmd, languages=languages, timeout=per_page) for p in pngs]
    return Extracted("\n".join(parts), "pdf_ocr", read, total)
