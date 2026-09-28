"""Shared fixtures for the verdict API tests.

Inputs are real-shaped evidence bundles exercising each engine outcome.
Expected scores for the `scored` fixture are computed by hand below from the
published rules (spec §6), so the test asserts the implementation — not itself.
"""
import json
from pathlib import Path

FIXDIR = Path(__file__).parent / "fixtures"


def item(eid, issuer, issuer_type, weight_class, status="verified", **kw):
    d = {
        "evidence_id": eid,
        "kind": kw.get("kind", "protocol-registration-claim"),
        "issuer": issuer,
        "identity_cluster": kw.get("identity_cluster"),
        "issuer_type": issuer_type,
        "description": kw.get("description", "Fixture evidence item %s." % eid),
        "status": status,
        "observed_at": kw.get("observed_at", "2026-09-15T19:30:00Z"),
        "source_url": kw.get("source_url"),
        "source_ref": kw.get("source_ref", "fixture"),
        "weight_class": weight_class,
    }
    return d


def base_doc(**kw):
    d = {
        "engine_version": "1.0.0",
        "subject": {"agent_id": "MUSE_CWI", "display_name": "KingCode"},
        "context": "agent-trust",
        "observed_at": "2026-09-15T19:30:00Z",
        "signals": {"erc8004": [], "needle_drop": [], "first_spin": []},
    }
    d.update(kw)
    return d


def scored_doc():
    """Meets the agent-trust gate: 3+ verified, 2+ families, erc8004 required.

    Hand computation (spec §5–§6):
      erc8004:   w3 protocol + w2 third_party = 5  -> 5/(5+3) = 0.625
      needle_drop: w2 third_party = 2              -> 2/(2+3) = 0.4
      first_spin:  w2 third_party = 2              -> 0.4
      score = mean(0.625, 0.4, 0.4) = 0.475 -> band "thin"
    """
    d = base_doc()
    d["signals"]["erc8004"] = [
        item("e8004-a", "moltbook", "third_party", 2),
        item("e8004-b", "erc8004-registry", "protocol", 3),
    ]
    d["signals"]["needle_drop"] = [
        item("nd-a", "cwi-ledger", "protocol", 2,
             kind="needle-drop-placement"),
    ]
    d["signals"]["first_spin"] = [
        item("fs-a", "first-spin", "third_party", 2,
             kind="published-verdict"),
    ]
    return d


def insufficient_doc():
    """agent-trust gate needs 3 verified across 2 families — this has 1."""
    d = base_doc()
    d["signals"]["erc8004"] = [item("e8004-only", "moltbook", "third_party", 2)]
    return d


def disputed_doc():
    d = insufficient_doc()
    d["signals"]["erc8004"].append(
        item("e8004-disputed", "rival-registry", "third_party", 2,
             status="disputed", description="Live dispute over registration."))
    return d


def invalid_version_doc():
    d = scored_doc()
    d["engine_version"] = "9.9.9"
    return d


def duplicate_id_doc():
    d = scored_doc()
    d["signals"]["erc8004"].append(item("e8004-a", "other", "third_party", 1))
    return d


def write_fixtures():
    FIXDIR.mkdir(parents=True, exist_ok=True)
    for name, doc in [
        ("scored.json", scored_doc()),
        ("insufficient.json", insufficient_doc()),
        ("disputed.json", disputed_doc()),
        ("invalid_version.json", invalid_version_doc()),
        ("duplicate_id.json", duplicate_id_doc()),
    ]:
        (FIXDIR / name).write_text(json.dumps(doc, indent=2) + "\n")


if __name__ == "__main__":
    write_fixtures()
    print("wrote", len(list(FIXDIR.glob("*.json"))), "fixtures to", FIXDIR)
