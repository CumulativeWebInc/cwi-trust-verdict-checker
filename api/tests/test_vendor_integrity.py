"""Vendored-engine integrity tests.

The engine is spec-versioned: weights, thresholds, damping rules and gates
must NEVER be edited ad hoc (spec §11). These tests pin the vendored copy's
bytes and its public constants, so any drift fails loudly.
"""
import hashlib
import re
from pathlib import Path

from app.vendor import engine

ENGINE_PATH = Path(__file__).parent.parent / "app" / "vendor" / "engine.py"
# Pinned at vendor time; see VENDOR_PROVENANCE.md for source + procedure.
PINNED_SHA256 = "516ae49cf00cc0aae44bcf08ecf5e617442772d2cccdf7c09fa1d117802f3439"


def test_engine_bytes_match_pinned_hash():
    digest = hashlib.sha256(ENGINE_PATH.read_bytes()).hexdigest()
    assert digest == PINNED_SHA256, (
        "vendored engine.py drifted from the pinned upstream bytes — "
        "re-vendor via scripts/vendor_engine.sh, never hand-edit")


def test_versions():
    assert engine.ENGINE_VERSION == "1.0.0"
    assert engine.SPEC_VERSION == "1.0.0"
    assert engine.ENGINE_NAME == "cwi-verdict-engine"


def test_weights_thresholds_unchanged():
    # Spec §5–§6 constants: any change here is a spec bump, not an edit.
    assert engine.SELF_ASSERTION_FACTOR == 0.5
    assert engine.ISSUER_CAP_PER_FAMILY == 2
    assert engine.SATURATION_K == 3.0
    assert engine.WEIGHT_CLASSES == {1: "self-asserted",
                                    2: "third-party-attested",
                                    3: "protocol-or-ledger-sealed"}


def test_context_gates_unchanged():
    gates = {name: (c["min_verified"], c["min_families"],
                    tuple(c["required_families"]), tuple(c["required_any_of"]))
             for name, c in engine.CONTEXTS.items()}
    assert gates == {
        "agent-trust": (3, 2, ("erc8004",), ()),
        "music-review": (2, 1, (), ("first_spin", "needle_drop")),
        "payments": (2, 2, ("erc8004", "needle_drop"), ()),
    }


def test_engine_is_stdlib_only():
    """The vendored engine must import nothing but the standard library."""
    stdlib = {"hashlib", "json", "sys"}
    src = ENGINE_PATH.read_text()
    imports = set(re.findall(r"^(?:import|from)\s+([a-zA-Z0-9_]+)", src,
                             flags=re.MULTILINE))
    assert imports <= stdlib, "non-stdlib import in vendored engine: %s" % (
        imports - stdlib)
