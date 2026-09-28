"""Receipt verification procedure tests (scripts/verify_receipt.py)."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "verify_receipt",
    Path(__file__).parent.parent / "scripts" / "verify_receipt.py")
verify_receipt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_receipt)


def test_verify_envelope_unsigned(client, scored_payload):
    r = client.post("/v1/verdicts", json=scored_payload)
    assert r.status_code == 200
    ok, messages = verify_receipt.verify_envelope(r.json())
    assert ok, messages
    assert any("verdict_hash" in m for m in messages)


def test_verify_envelope_hmac(client, scored_payload, monkeypatch):
    monkeypatch.setenv("TVC_RECEIPT_SECRET", "s3cret-for-tests")
    r = client.post("/v1/verdicts", json=scored_payload)
    assert r.status_code == 200
    ok, messages = verify_receipt.verify_envelope(r.json(),
                                                  secret="s3cret-for-tests")
    assert ok, messages
    assert any("HMAC" in m and m.startswith("PASS") for m in messages)
    # Wrong secret must FAIL, not pass.
    ok2, _ = verify_receipt.verify_envelope(r.json(), secret="wrong")
    assert not ok2


def test_verify_envelope_tamper_detected(client, scored_payload):
    r = client.post("/v1/verdicts", json=scored_payload)
    envelope = r.json()
    envelope["verdict"]["score"] = 1.0  # tamper with the verdict
    ok, messages = verify_receipt.verify_envelope(envelope)
    assert not ok
    assert any("FAIL" in m for m in messages)


def test_verify_input_binding(client, scored_payload):
    r = client.post("/v1/verdicts", json=scored_payload)
    ok, messages = verify_receipt.verify_input_binding(r.json(), scored_payload)
    assert ok, messages
