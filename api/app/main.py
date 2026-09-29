"""CWI Trust Verdict API — FastAPI wrapper around the CWI Verdict Engine.

Endpoints:
    POST /v1/verdicts   Score an evidence bundle (engine input contract).
    GET  /v1/health     Service + engine version info.
    GET  /v1/contexts   Supported scoring contexts (from the engine registry).
    GET  /openapi.json  OpenAPI 3.1 schema.

Status mapping:
    engine exit 0 (scored | insufficient-data | evidence-disputed |
      unknown-context) -> HTTP 200 with the full envelope.
    engine exit 2 (invalid-input)       -> HTTP 422 with the envelope
      (the verdict payload carries status "invalid-input" and the reason).
    pydantic schema violations          -> HTTP 422, machine-readable.

The API is stateless: no evidence is persisted, and access logs carry only
method/path/status/input_sha256 — never raw evidence.
"""
import logging
from json import JSONDecodeError

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import engine_adapter as adapter
from app.limits import HardeningMiddleware
from app.schemas import VerdictRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("tvc")

API_VERSION = "1.0.0"

app = FastAPI(
    title="CWI Trust Verdict API",
    version=API_VERSION,
    openapi_version="3.1.0",
    summary="Deterministic, evidence-bound agent trust scoring (CWI Verdict Engine).",
    description=(
        "REST wrapper around the CWI Verdict Engine v1.0.0. The engine never "
        "invents a score: insufficient or disputed evidence yields a refusal "
        "status, never a number. Every verdict carries `input_sha256` binding "
        "it to the exact input that produced it. The `receipt` envelope is an "
        "unsigned stub — signed receipts are the paid tier's scarcity product; "
        "scoring itself is free and deterministic."
    ),
    license_info={"name": "License: TBD — see api/README.md (licensing needs Black's word)"},
)

app.add_middleware(HardeningMiddleware)


def _validation_422(errors):
    """Machine-readable 422 for malformed requests."""
    details = []
    for err in errors:
        details.append({
            "loc": list(err.get("loc", ())),
            "msg": err.get("msg"),
            "type": err.get("type"),
            "input": err.get("input"),
        })
    return JSONResponse(
        status_code=422,
        content={"error": {
            "code": "validation_error",
            "message": "Request failed schema validation.",
            "details": details}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return _validation_422(exc.errors())


@app.exception_handler(ValidationError)
async def pydantic_error_handler(request: Request, exc: ValidationError):
    # Raised by the manual model_validate() call in create_verdict.
    return _validation_422(exc.errors())


@app.get("/v1/health", summary="Service and engine health")
def health():
    info = adapter.engine_info()
    return {
        "status": "ok",
        "service": "cwi-trust-verdict-api",
        "api_version": API_VERSION,
        "engine": info,
        "contexts": sorted(adapter.contexts_payload()["contexts"].keys()),
    }


@app.get("/v1/contexts", summary="Supported scoring contexts")
def contexts():
    return adapter.contexts_payload()


@app.post("/v1/verdicts", summary="Score an evidence bundle")
async def create_verdict(request: Request):
    # Validate with pydantic (violations -> 422 via the handlers above), but
    # run the engine on the RAW body: input_sha256 must bind exactly the
    # bytes the caller sent, not a re-serialized model.
    try:
        raw = await request.json()
    except JSONDecodeError:
        return JSONResponse(
            status_code=422,
            content={"error": {
                "code": "invalid_json",
                "message": "Request body is not valid JSON."}})
    parsed = VerdictRequest.model_validate(raw)
    doc = dict(raw)
    anchor_ref = doc.pop("anchor_ref", None)
    _ = parsed  # validation only; `doc` is the engine input

    output, exit_code = adapter.run_engine(doc)

    # Stash the binding hash for the privacy-safe access log (hash only).
    request.state.input_sha256 = output.get("input_sha256")

    envelope = adapter.build_envelope(output, anchor_ref)
    status_code = 200 if exit_code == 0 else 422
    return JSONResponse(status_code=status_code, content=envelope)
