# ── Build ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /build
RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/deps -r requirements.txt

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
# curl for healthcheck; gammu-smsd for SMS sending (optional — remove if not using Gammu)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gammu \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /deps /usr/local
WORKDIR /app
COPY app/ app/
EXPOSE 3003
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3003"]
