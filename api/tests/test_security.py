"""Hardening tests: schema validation, rate limiting, request size caps."""
import copy

import pytest

from app import limits
from conftest import load_fixture


def _err_body(r):
    body = r.json()
    assert "error" in body and "code" in body["error"]
    return body["error"]


def test_missing_agent_id_422_machine_readable(client):
    payload = load_fixture("scored.json")
    del payload["subject"]["agent_id"]
    r = client.post("/v1/verdicts", json=payload)
    assert r.status_code == 422
    err = _err_body(r)
    assert err["code"] == "validation_error"
    assert any("agent_id" in str(d.get("loc", [])) for d in err["details"])


def test_bad_enum_422(client):
    payload = load_fixture("scored.json")
    payload["signals"]["erc8004"][0]["status"] = "probably-fine"
    r = client.post("/v1/verdicts", json=payload)
    assert r.status_code == 422
    assert _err_body(r)["code"] == "validation_error"


def test_extra_field_rejected_422(client):
    payload = load_fixture("scored.json")
    payload["hacker_field"] = "drop table"
    r = client.post("/v1/verdicts", json=payload)
    assert r.status_code == 422
    assert _err_body(r)["code"] == "validation_error"


def test_missing_signal_family_422(client):
    payload = load_fixture("scored.json")
    del payload["signals"]["needle_drop"]
    r = client.post("/v1/verdicts", json=payload)
    assert r.status_code == 422


def test_malformed_json_422(client):
    r = client.post("/v1/verdicts", content=b"{not json",
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_rate_limit_429_with_retry_after(client, monkeypatch, scored_payload):
    monkeypatch.setattr(limits, "VERDICT_LIMIT", 2)
    limits.reset_limiter()
    assert client.post("/v1/verdicts", json=scored_payload).status_code == 200
    assert client.post("/v1/verdicts", json=scored_payload).status_code == 200
    r = client.post("/v1/verdicts", json=scored_payload)
    assert r.status_code == 429
    err = _err_body(r)
    assert err["code"] == "rate_limited"
    assert "Retry-After" in r.headers
    assert err["retry_after"] >= 1


def test_oversized_body_413(client, monkeypatch):
    monkeypatch.setattr(limits, "MAX_BODY_BYTES", 64)
    payload = load_fixture("scored.json")
    r = client.post("/v1/verdicts", json=payload)
    assert r.status_code == 413
    assert _err_body(r)["code"] == "request_too_large"


def test_unknown_route_404(client):
    assert client.get("/v1/nope").status_code == 404
