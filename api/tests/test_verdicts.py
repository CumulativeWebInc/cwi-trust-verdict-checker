"""Core verdict-endpoint tests: the engine contract over HTTP.

- determinism: same input twice -> byte-identical response bodies
- insufficient-data / evidence-disputed / unknown-context -> 200 + refusal status
- invalid-input (engine-level) -> 422 with verdict.status == "invalid-input"
- scored -> exact hand-computed score, band, receipt stub contents
"""
from conftest import load_fixture


def post(client, payload):
    return client.post("/v1/verdicts", json=payload)


def test_determinism_byte_identical(client, scored_payload):
    r1 = post(client, scored_payload)
    r2 = post(client, scored_payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.content == r2.content, "same input must yield byte-identical output"
    body = r1.json()
    assert body["verdict"]["input_sha256"] is not None


def test_scored_exact_value(client, scored_payload):
    r = post(client, scored_payload)
    assert r.status_code == 200
    body = r.json()
    verdict = body["verdict"]
    # Hand-computed from spec §6: mean(0.625, 0.4, 0.4) = 0.475 -> "thin".
    assert verdict["status"] == "scored"
    assert verdict["score"] == 0.475
    assert verdict["band"] == "thin"
    assert verdict["missing"] == []
    # input_sha256 must equal the engine's canonical hash of the input.
    import hashlib, json
    canon = json.dumps(scored_payload, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False).encode()
    assert verdict["input_sha256"] == hashlib.sha256(canon).hexdigest()


def test_receipt_verifiable_contents(client, scored_payload):
    r = post(client, scored_payload)
    receipt = r.json()["receipt"]
    verdict = r.json()["verdict"]
    assert receipt["receipt_format"] == "cwi-verdict-receipt/1"
    assert receipt["status"] == "scored"
    assert receipt["score"] == 0.475
    assert receipt["input_sha256"] == verdict["input_sha256"]
    # Public integrity: verdict_hash recomputes from the verdict object.
    import hashlib, json
    canon = json.dumps(verdict, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False).encode()
    assert receipt["verdict_hash"] == hashlib.sha256(canon).hexdigest()
    # No secret configured in tests -> signature fields are null (honest).
    assert receipt["signature"]["alg"] is None
    assert receipt["signature"]["value"] is None
    # No anchor supplied -> unanchored (spec §6b, honest default).
    assert receipt["provenance"] == "unanchored"
    assert receipt["anchor_ref"] is None


def test_receipt_hmac_signature_when_secret_set(client, scored_payload,
                                               monkeypatch):
    import hashlib, hmac, json
    monkeypatch.setenv("TVC_RECEIPT_SECRET", "test-secret-123")
    r = post(client, scored_payload)
    body = r.json()
    sig = body["receipt"]["signature"]
    assert sig["alg"] == "hmac-sha256"
    expected = hmac.new(b"test-secret-123",
                        body["receipt"]["verdict_hash"].encode(),
                        hashlib.sha256).hexdigest()
    assert sig["value"] == expected
    # Determinism holds with the secret set too.
    r2 = post(client, scored_payload)
    assert r.content == r2.content


def test_receipt_anchored_when_anchor_ref_supplied(client, scored_payload):
    scored_payload["anchor_ref"] = "ipfs://bafy-fixture-anchor"
    r = post(client, scored_payload)
    assert r.status_code == 200
    receipt = r.json()["receipt"]
    assert receipt["provenance"] == "anchored"
    assert receipt["anchor_ref"] == "ipfs://bafy-fixture-anchor"
    # anchor_ref is API-level only: it must NOT leak into the engine input hash.
    import hashlib, json
    stripped = dict(scored_payload)
    del stripped["anchor_ref"]
    canon = json.dumps(stripped, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False).encode()
    assert r.json()["verdict"]["input_sha256"] == hashlib.sha256(canon).hexdigest()


def test_insufficient_data(client):
    r = post(client, load_fixture("insufficient.json"))
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"]["status"] == "insufficient-data"
    assert body["verdict"]["score"] is None
    assert body["verdict"]["band"] is None
    assert len(body["verdict"]["missing"]) > 0
    assert body["receipt"]["status"] == "insufficient-data"


def test_evidence_disputed(client):
    r = post(client, load_fixture("disputed.json"))
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"]["status"] == "evidence-disputed"
    assert body["verdict"]["score"] is None
    assert "e8004-disputed" in " ".join(body["verdict"]["missing"])


def test_unknown_context(client, scored_payload):
    scored_payload["context"] = "teleportation-review"
    r = post(client, scored_payload)
    assert r.status_code == 200
    assert r.json()["verdict"]["status"] == "unknown-context"
    assert r.json()["verdict"]["score"] is None


def test_invalid_input_engine_version(client):
    r = post(client, load_fixture("invalid_version.json"))
    assert r.status_code == 422
    body = r.json()
    assert body["verdict"]["status"] == "invalid-input"
    assert body["verdict"]["score"] is None
    assert any("engine_version" in m for m in body["verdict"]["missing"])


def test_invalid_input_duplicate_evidence_id(client):
    r = post(client, load_fixture("duplicate_id.json"))
    assert r.status_code == 422
    body = r.json()
    assert body["verdict"]["status"] == "invalid-input"
    assert any("duplicate" in m for m in body["verdict"]["missing"])
