"""Meta-endpoint tests: health, contexts, OpenAPI 3.1 validity."""
import openapi_spec_validator


def test_health(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "cwi-trust-verdict-api"
    assert body["engine"]["engine_version"] == "1.0.0"
    assert body["engine"]["spec_version"] == "1.0.0"
    assert set(body["contexts"]) == {"agent-trust", "music-review", "payments"}


def test_contexts(client):
    r = client.get("/v1/contexts")
    assert r.status_code == 200
    contexts = r.json()["contexts"]
    assert set(contexts) == {"agent-trust", "music-review", "payments"}
    at = contexts["agent-trust"]
    assert at["min_verified"] == 3
    assert at["min_families"] == 2
    assert at["required_families"] == ["erc8004"]
    assert "description" in at and "rationale" in at
    pay = contexts["payments"]
    assert pay["required_families"] == ["erc8004", "needle_drop"]
    mr = contexts["music-review"]
    assert mr["required_any_of"] == ["first_spin", "needle_drop"]


def test_openapi_is_31_and_valid(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["openapi"].startswith("3.1"), spec["openapi"]
    # Validates against the official OpenAPI 3.1 schema (offline, bundled).
    openapi_spec_validator.validate(spec)
    paths = spec["paths"]
    assert "/v1/verdicts" in paths
    assert "post" in paths["/v1/verdicts"]
    assert "/v1/health" in paths
    assert "/v1/contexts" in paths
