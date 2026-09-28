#!/usr/bin/env python3
"""Verify a Trust Verdict API receipt envelope — offline, stdlib only.

Usage:
    python3 scripts/verify_receipt.py response.json            # public check
    TVC_RECEIPT_SECRET=<secret> python3 scripts/verify_receipt.py response.json

The JSON file must be a POST /v1/verdicts response envelope:
    {"verdict": {...}, "receipt": {...}}

Checks performed:
  1. verdict_hash == sha256(canonical_json(verdict))   [public, no secret]
  2. receipt.input_sha256 == sha256(canonical_json(input)) — only when the
     original request body is supplied via --input request.json.
  3. signature.value == HMAC_SHA256(secret, verdict_hash) when the receipt
     carries an HMAC signature and TVC_RECEIPT_SECRET is provided.

Exit 0 = all applicable checks passed; exit 1 = any check failed.
"""
import hashlib
import hmac
import json
import os
import sys


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha256hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_envelope(envelope, secret=""):
    """Return (ok, [messages]). Pure function — also used by the test suite."""
    messages = []
    ok = True
    verdict = envelope.get("verdict")
    receipt = envelope.get("receipt")
    if not isinstance(verdict, dict) or not isinstance(receipt, dict):
        return False, ["envelope must contain 'verdict' and 'receipt' objects"]

    recomputed = sha256hex(canonical(verdict))
    if receipt.get("verdict_hash") == recomputed:
        messages.append("PASS verdict_hash matches canonical verdict JSON")
    else:
        ok = False
        messages.append("FAIL verdict_hash mismatch: receipt=%s recomputed=%s"
                        % (receipt.get("verdict_hash"), recomputed))

    sig = receipt.get("signature") or {}
    if sig.get("alg") == "hmac-sha256":
        if not secret:
            messages.append("SKIP HMAC check: set TVC_RECEIPT_SECRET to verify "
                            "the operator signature")
        else:
            expected = hmac.new(secret.encode("utf-8"),
                                receipt["verdict_hash"].encode("utf-8"),
                                hashlib.sha256).hexdigest()
            if hmac.compare_digest(expected, sig.get("value") or ""):
                messages.append("PASS HMAC operator signature valid")
            else:
                ok = False
                messages.append("FAIL HMAC operator signature mismatch")
    else:
        messages.append("INFO no operator signature on this receipt "
                        "(integrity check only)")

    return ok, messages


def verify_input_binding(envelope, request_doc):
    """Check receipt.input_sha256 binds the exact request doc sent."""
    want = sha256hex(canonical(request_doc))
    got = (envelope.get("receipt") or {}).get("input_sha256")
    if got == want:
        return True, ["PASS input_sha256 binds the supplied request body"]
    return False, ["FAIL input_sha256 mismatch: receipt=%s recomputed=%s"
                   % (got, want)]


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        sys.stderr.write(__doc__ + "\n")
        return 2
    envelope = json.load(open(argv[1], encoding="utf-8"))
    secret = os.environ.get("TVC_RECEIPT_SECRET", "")
    ok, messages = verify_envelope(envelope, secret)
    input_path = None
    if "--input" in argv:
        input_path = argv[argv.index("--input") + 1]
        ok2, msgs2 = verify_input_binding(
            envelope, json.load(open(input_path, encoding="utf-8")))
        ok = ok and ok2
        messages.extend(msgs2)
    for m in messages:
        print(m)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
