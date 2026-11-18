# Scan to fill (camera or upload)

On **Records → Add record** and **Lab results → Scan a report**, a patient can take a photo or choose
a photo/PDF of a report. The page reads it and pre-fills the form. The patient checks every field and
presses Save.

## What it does
| Where | Fills in | Then |
| --- | --- | --- |
| Add record | type, title, date, doctor/lab; attaches the scanned file | Save as usual. If lab rows were found, a review step offers to add them, linked to the new record |
| Lab results → Scan a report | one editable row per test (name, result, unit, range) + the test date | Save the ticked rows together (`POST /labs/bulk`, all or none); optionally also keep the report file in Records |

## Rules it keeps
- **A draft is not a record.** `POST /records/scan` stores nothing (no file, no text, no result). The
  ordinary create endpoints store what the patient confirms, as `patient_reported`.
- **Nothing is invented.** Every value is copied from a line of the report; unknown stays empty. A
  range is used only if it is printed beside the value. The flag (low/normal/high) is still computed
  by the server from that range. Text such as "Non-reactive" stays text. "< 0.5" stays text, not 0.5.
- **No identifiers.** Name, phone, ID and address are never extracted or returned.
- **Local only.** Reading is done on this server with Tesseract (photos, scanned PDFs) and pypdf (PDFs
  with a text layer). No image or text goes to any other service. The image is piped to Tesseract and
  never written to disk.
- **Low-confidence rows start unticked**, each row shows the report line it came from, and a notice
  says a picture can be misread (1/l, 0/O).
- Audit row `record.scan` holds size, type, method, pages and row count. Never text or values.

## Limits (all in `core/config.py`)
`SCAN_ENABLED`, `OCR_LANGUAGES` (default `eng`), `scan_timeout_seconds` (45), `scan_max_pages` (5),
`scan_max_pixels` (40 MP), `scan_requests_per_minute` (10 per user), at most 2 scans at once per
process, and the normal upload cap. `GET /records/scan/status` tells the page what this server can
read; the buttons are hidden when it cannot.

## Setup
- Docker: Tesseract is installed in `backend/Dockerfile`. For Hindi or Odia, build with
  `--build-arg OCR_EXTRA_PACKS="tesseract-ocr-hin tesseract-ocr-ori"` and set `OCR_LANGUAGES=eng+hin+ori`.
- Local dev: `sudo apt install tesseract-ocr`, then `pip install -r requirements.txt`.
- The browser needs `Permissions-Policy: camera=(self)` (set in `frontend/next.config.mjs`). On phones
  the system camera app is used; on a computer the page opens a live camera view.

## Known limits
- Accuracy depends on the photo. Multi-column or handwritten reports, and unusual table layouts, may
  give few or wrong rows; that is why every field is reviewed before saving.
- Dates are read day-first (as Indian reports print them). When day and month could be swapped, the
  patient is told to check.
