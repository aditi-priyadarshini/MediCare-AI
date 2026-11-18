FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
# Tesseract reads photos and scanned PDFs for "scan to fill" (locally; nothing leaves the server).
# espeak-ng is the server's voice for reminder calls (TTS_COMMAND="espeak-ng --stdin -w {out}").
# English is included. For Hindi/Odia add packs at build time, then set OCR_LANGUAGES, e.g.:
#   docker compose build --build-arg OCR_EXTRA_PACKS="tesseract-ocr-hin tesseract-ocr-ori"
#   OCR_LANGUAGES=eng+hin+ori
ARG OCR_EXTRA_PACKS=""
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr espeak-ng ${OCR_EXTRA_PACKS} \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home --uid 10001 app && mkdir -p /data/files && chown -R app /app /data
USER app
EXPOSE 8000
# Migrations run as a separate one-shot step (see docker-compose.yml "migrate").
CMD ["uvicorn", "app.main:app_factory", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
