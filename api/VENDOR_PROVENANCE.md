# Vendor provenance — `api/app/vendor/engine.py`

| Field | Value |
|---|---|
| Source repo | `CumulativeWebInc/cwi-learn` |
| Source path | `trust/engine.py` |
| Source branch | `needs/verdict-engine` (fall back to `main`) |
| Vendored | 2026-09-28 |
| SHA-256 (pinned) | `516ae49cf00cc0aae44bcf08ecf5e617442772d2cccdf7c09fa1d117802f3439` |
| Engine version | `1.0.0` / spec `1.0.0` |
| Modifications | **NONE — byte-identical to upstream.** |

The engine is spec-versioned (spec §11): weights, thresholds, damping rules
and gates may only change via a spec bump, never an ad-hoc edit. Enforcement:

1. `tests/test_vendor_integrity.py` fails if the vendored bytes drift from the
   pinned hash, or if any weight/threshold/gate constant changes.
2. `scripts/vendor_engine.sh` re-fetches upstream and REFUSES to write unless
   the bytes match the pinned hash. If upstream legitimately changes, that is
   a spec event: open a review, do not overwrite.

Stdlib-only: the vendored module imports only `hashlib`, `json`, `sys`
(asserted by test).
