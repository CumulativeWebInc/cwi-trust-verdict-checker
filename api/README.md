# CWI Trust Verdict API

REST wrapper around the **CWI Verdict Engine v1.0.0** — deterministic,
evidence-bound agent trust scoring. The engine never invents a score:
insufficient or disputed evidence yields a refusal status, never a number.

- `POST /v1/verdicts` — score an evidence bundle (engine input contract)
- `GET /v1/health` — service + engine version info
- `GET /v1/contexts` — supported scoring contexts (from the engine registry)
- `GET /openapi.json` — OpenAPI 3.1 schema (validated in CI by test)

Every verdict carries `input_sha256` binding it to the exact input that
produced it, plus a verifiable `receipt` envelope (see below).

## Run locally — one command

```bash
cd api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Or with Docker (no Python needed):

```bash
cd api && docker compose up
```

Try it:

```bash
curl -s localhost:8000/v1/health
curl -s localhost:8000/v1/contexts
curl -s -X POST localhost:8000/v1/verdicts \
  -H 'Content-Type: application/json' \
  -d @tests/fixtures/scored.json | python3 -m json.tool | head -40
```

## Receipts — how to verify

Each `POST /v1/verdicts` response is an envelope:

```json
{ "verdict": { "...engine output...", "input_sha256": "..." },
  "receipt": { "receipt_format": "cwi-verdict-receipt/1",
               "verdict_hash": "...", "signature": {...}, ... } }
```

**Choice made:** public integrity via SHA-256 hash-chain (no keys, no cost),
operator authenticity via HMAC-SHA256 with a local secret. No wallet signing
anywhere — wallet-signed receipts are the paid tier's product, not this API's.

Verify offline (stdlib only):

```bash
# 1. public integrity: verdict_hash == sha256(canonical_json(verdict))
python3 scripts/verify_receipt.py response.json

# 2. also check input_sha256 binds the request you sent
python3 scripts/verify_receipt.py response.json --input request.json

# 3. operator signature (only when the deployment set TVC_RECEIPT_SECRET)
TVC_RECEIPT_SECRET=<secret> python3 scripts/verify_receipt.py response.json
```

Set `TVC_RECEIPT_SECRET` in the environment (docker-compose, Railway
variables) to attach HMAC operator signatures. Unset = integrity-only
receipts; both modes are deterministic (same input → byte-identical output).

## Hardening

- Pydantic validation: malformed input → `422` with machine-readable
  `{"error": {"code", "message", "details"}}`. Engine-level `invalid-input`
  also surfaces as `422` with the engine's reason in `verdict.missing`.
- Rate limiting: 30 req/min/IP on `POST /v1/verdicts`, 240/min on reads →
  `429` + `Retry-After`.
- Request size cap: 256 KiB → `413`.
- Privacy: stateless — no evidence persisted server-side; access logs record
  method/path/status/`input_sha256` only, never raw evidence.

## Tests

```bash
cd api && python -m pytest -q
```

30 tests, all green: determinism (byte-identical double-POST), scored exact
value (0.475/thin, hand-computed), insufficient-data, evidence-disputed,
unknown-context, engine invalid-input → 422, pydantic 422s, rate-limit 429,
oversized 413, receipt verification (hash recompute, HMAC, tamper detection,
input binding), OpenAPI 3.1 validity, vendored-engine integrity (pinned
sha256 + spec constants).

## Deploy-ready checklist

| Item | State |
|---|---|
| `Dockerfile` (non-root, `$PORT`) | ✅ done |
| `docker-compose.yml` one-command local run | ✅ done |
| `api/railway.json` (service root = `api/`, healthcheck `/v1/health`) | ✅ done |
| `TVC_RECEIPT_SECRET` env wiring (compose + Dockerfile docs) | ✅ done |
| x402 adapter seam | ✅ design doc only (`docs/x402-adapter.md`), no charges |
| **Merge `suite/api-v1` → `main`** | ⏳ needs Black's word |
| **Railway production deploy** | ⏳ needs Black's word |
| **`TVC_RECEIPT_SECRET` value for production** | ⏳ Black provisions (never in repo/chat) |
| **License choice for the repo** | ⏳ needs Black's word (no LICENSE file added) |
| Public docs / announcement | ⏳ needs Black's exact-copy approval |

## Notes

- Engine vendored verbatim from `CumulativeWebInc/cwi-learn`
  (`needs/verdict-engine`); provenance + pin in `VENDOR_PROVENANCE.md`.
  Weights/thresholds/gates are spec-versioned — never edited here.
- Paid tier sells scarcity (verified evidence feeds, wallet-signed receipts),
  not scoring — per the packaging decision.
