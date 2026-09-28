"""Adapter between the HTTP layer and the vendored CWI Verdict Engine.

The engine is imported (not subprocessed, not rewritten). Its `run(doc)`
returns (output_dict, exit_code) with exit 2 meaning `invalid-input`.
This module builds the API response envelope:

    {
      "verdict": <engine output verbatim, carries input_sha256>,
      "receipt": <verifiable receipt envelope, cwi-verdict-receipt/1>
    }

Receipt verifiability (no wallet signing, no paid keys, $0):
  1. PUBLIC INTEGRITY — `verdict_hash` is the SHA-256 of the canonical JSON
     of the `verdict` object (sort_keys, compact separators). Anyone holding
     the verdict can recompute it; no secret needed.
  2. OPERATOR SIGNATURE — when the `TVC_RECEIPT_SECRET` env var is set, the
     API also attaches an HMAC-SHA256 over `verdict_hash` keyed by that
     secret. This is a symmetric operator signature: it proves the receipt
     came from this API deployment. It is NOT a wallet signature and NOT an
     on-chain attestation — the packaging decision reserves cryptographic
     (wallet-signed) receipts as the paid tier's scarcity product.
When no secret is configured the signature fields are null and the receipt
is integrity-verifiable only (public hash). See scripts/verify_receipt.py
and api/README.md for the verification procedure.
"""
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Tuple

from app.vendor import engine as _engine

RECEIPT_FORMAT = "cwi-verdict-receipt/1"


def canonical(obj: Any) -> bytes:
    """Deterministic canonical JSON bytes (matches the engine's own scheme)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha256hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_engine(doc: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """Run the vendored engine on a validated input doc."""
    return _engine.run(doc)


def build_receipt(output: Dict[str, Any], anchor_ref: Any,
                  secret: str = None) -> Dict[str, Any]:
    """Build the verifiable receipt envelope.

    Deterministic by construction: no timestamps, no UUIDs, no randomness —
    the same engine output + secret always yields the same receipt, so
    POSTing the same input twice produces byte-identical response bodies.
    `secret` defaults to the TVC_RECEIPT_SECRET env var.
    """
    if secret is None:
        secret = os.environ.get("TVC_RECEIPT_SECRET", "")
    verdict_hash = sha256hex(canonical(output))
    if secret:
        sig_value = hmac.new(secret.encode("utf-8"),
                             verdict_hash.encode("utf-8"),
                             hashlib.sha256).hexdigest()
        signature = {
            "alg": "hmac-sha256",
            "value": sig_value,
            "note": ("Symmetric operator signature: HMAC-SHA256 over "
                     "verdict_hash keyed by the deployment's "
                     "TVC_RECEIPT_SECRET. Not a wallet signature; not "
                     "on-chain. Verifiable only by the operator holding "
                     "the secret."),
        }
    else:
        signature = {
            "alg": None,
            "value": None,
            "note": ("No TVC_RECEIPT_SECRET configured: receipt is "
                     "integrity-verifiable via verdict_hash only."),
        }
    return {
        "receipt_format": RECEIPT_FORMAT,
        "status": output.get("status"),
        "score": output.get("score"),
        "band": output.get("band"),
        "context": output.get("context"),
        "engine": output.get("engine"),
        "engine_version": output.get("engine_version"),
        "spec_version": output.get("spec_version"),
        "input_sha256": output.get("input_sha256"),
        "provenance": "anchored" if anchor_ref else "unanchored",
        "anchor_ref": anchor_ref,
        "verdict_hash": verdict_hash,
        "signature": signature,
        "verification": ("Recompute sha256(canonical_json(verdict)) and "
                         "compare to verdict_hash; if signature.alg is "
                         "hmac-sha256, recompute "
                         "HMAC_SHA256(secret, verdict_hash). See "
                         "scripts/verify_receipt.py."),
    }


def build_envelope(output: Dict[str, Any], anchor_ref: Any,
                   secret: str = None) -> Dict[str, Any]:
    return {
        "verdict": output,
        "receipt": build_receipt(output, anchor_ref, secret=secret),
    }


def contexts_payload() -> Dict[str, Any]:
    """Supported scoring contexts, straight from the engine's registry."""
    return {
        "contexts": {
            name: {
                "description": cfg["description"],
                "min_verified": cfg["min_verified"],
                "min_families": cfg["min_families"],
                "required_families": cfg["required_families"],
                "required_any_of": cfg["required_any_of"],
                "rationale": cfg["rationale"],
            }
            for name, cfg in _engine.CONTEXTS.items()
        }
    }


def engine_info() -> Dict[str, Any]:
    return {
        "name": _engine.ENGINE_NAME,
        "engine_version": _engine.ENGINE_VERSION,
        "spec_version": _engine.SPEC_VERSION,
    }
