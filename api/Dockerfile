# CWI Trust Verdict API — $0, open-source, stdlib-scored.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /srv

# Install runtime deps only (tests stay out of the image).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as non-root.
RUN useradd -m -u 10001 tvc && chown -R tvc:tvc /srv
USER tvc

EXPOSE 8000

# TVC_RECEIPT_SECRET: set at deploy time to enable HMAC operator signatures
# on verdict receipts. Unset = integrity-verifiable (verdict_hash) only.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
