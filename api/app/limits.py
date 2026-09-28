"""Hardening middleware: rate limiting, request-size caps, privacy-safe logging.

- Rate limiting: in-memory sliding window per client IP, separate budgets for
  the verdict endpoint (expensive) and read endpoints (cheap). 429 responses
  are machine-readable and carry Retry-After.
- Request size cap: requests with Content-Length over the cap, or bodies that
  grow past it during streaming reads, are rejected with 413.
- Logging: access logs record method, path, status code, input_sha256 and
  client IP only. Raw evidence is NEVER logged and nothing is persisted
  server-side — the API is stateless by design.
"""
import logging
import time
from collections import deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

log = logging.getLogger("tvc.access")

# Tunables (module-level so tests can monkeypatch).
VERDICT_LIMIT = 30      # POST /v1/verdicts per window per client IP
READ_LIMIT = 240        # GET /v1/* per window per client IP
WINDOW_SECONDS = 60
MAX_BODY_BYTES = 256 * 1024  # 256 KiB request bodies

_buckets: Dict[Tuple[str, str], Deque[float]] = {}


def _bucket_for(path: str, method: str) -> Tuple[str, int]:
    if path == "/v1/verdicts" and method == "POST":
        return "verdicts", VERDICT_LIMIT
    return "read", READ_LIMIT


def reset_limiter() -> None:
    """Test hook: clear all rate-limit state."""
    _buckets.clear()


def _check_limit(client_ip: str, bucket: str, limit: int, now: float):
    key = (client_ip, bucket)
    dq = _buckets.setdefault(key, deque())
    cutoff = now - WINDOW_SECONDS
    while dq and dq[0] <= cutoff:
        dq.popleft()
    if len(dq) >= limit:
        retry_after = int(dq[0] + WINDOW_SECONDS - now) + 1
        return retry_after
    dq.append(now)
    return None


class HardeningMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        client_ip = request.client.host if request.client else "unknown"

        # --- request size cap ---
        # Pre-read the body up to cap+1 bytes; reject oversized bodies with
        # 413 before any handler sees them, then re-inject the buffered body.
        chunks = []
        total = 0
        oversized = False
        while True:
            message = await request._receive()
            body = message.get("body", b"")
            chunks.append(body)
            total += len(body)
            if total > MAX_BODY_BYTES:
                oversized = True
                break
            if not message.get("more_body"):
                break
        if oversized:
            return JSONResponse(
                status_code=413,
                content={"error": {
                    "code": "request_too_large",
                    "message": ("Request body exceeds %d bytes."
                                % MAX_BODY_BYTES)}})

        buffered = b"".join(chunks)

        async def replay_receive():
            return {"type": "http.request", "body": buffered, "more_body": False}

        request._receive = replay_receive

        # --- rate limiting ---
        bucket, limit = _bucket_for(request.url.path, request.method)
        retry_after = _check_limit(client_ip, bucket, limit, time.monotonic())
        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={"error": {
                    "code": "rate_limited",
                    "message": ("Too many requests for this endpoint. "
                                "Retry after %d seconds." % retry_after),
                    "retry_after": retry_after}})

        response = await call_next(request)

        # --- privacy-safe access log: never the body, never evidence ---
        input_sha = getattr(request.state, "input_sha256", None)
        log.info("%s %s -> %s sha=%s ip=%s",
                 request.method, request.url.path,
                 response.status_code, input_sha, client_ip)
        return response
