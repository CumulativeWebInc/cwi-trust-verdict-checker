"""Shared test fixtures for the Trust Verdict API."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import limits
from app.main import app

FIXDIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def client():
    limits.reset_limiter()
    with TestClient(app) as c:
        yield c
    limits.reset_limiter()


def load_fixture(name: str):
    return json.loads((FIXDIR / name).read_text())


@pytest.fixture()
def scored_payload():
    return load_fixture("scored.json")
