"""Pydantic request models for the CWI Trust Verdict API.

These models mirror the CWI Verdict Engine input contract (trust/spec.md §3)
exactly. The engine itself is NEVER reimplemented here — it is vendored
verbatim under app/vendor/ and invoked through app/engine_adapter.py.

Extra keys are forbidden: the API rejects anything outside the engine
contract (plus the API-level `anchor_ref`) with a machine-readable 422.
"""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

IssuerType = Literal["self", "third_party", "protocol"]
EvidenceStatus = Literal["verified", "claimed", "pending", "disputed", "refuted"]
WeightClass = Literal[1, 2, 3]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Subject(StrictModel):
    agent_id: str = Field(..., min_length=1, description="Trust subject (non-empty).")
    display_name: Optional[str] = Field(
        default=None, description="Human label for the subject.")


class EvidenceItem(StrictModel):
    evidence_id: str = Field(..., min_length=1)
    kind: str = Field(..., min_length=1, description="Free-form evidence kind.")
    issuer: str = Field(..., min_length=1, description="Who vouches for this evidence.")
    identity_cluster: Optional[str] = Field(
        default=None,
        description="Groups issuers controlled by one entity; null = stands alone.")
    issuer_type: IssuerType = Field(...)
    description: str = Field(..., min_length=1)
    status: EvidenceStatus = Field(...)
    observed_at: str = Field(..., min_length=1, description="ISO-8601 date/datetime.")
    source_url: Optional[str] = Field(default=None)
    source_ref: Optional[str] = Field(
        default=None, description="Citable reference when no URL exists.")
    weight_class: WeightClass = Field(...)


class Signals(StrictModel):
    # All three families are REQUIRED keys (spec §3: "exactly the three
    # family keys"). An omitted family is a schema violation, not an empty one.
    erc8004: List[EvidenceItem]
    needle_drop: List[EvidenceItem]
    first_spin: List[EvidenceItem]


class VerdictRequest(StrictModel):
    """The engine input contract (§3) plus one API-level field.

    `anchor_ref` is NOT part of the engine contract: it is stripped before the
    doc reaches the engine and is used only to label the verdict's provenance
    axis (spec §6b) as `anchored` in the receipt envelope. Everything else is
    passed to the engine verbatim, so `input_sha256` binds exactly the §3 input.
    """
    engine_version: str = Field(...)
    subject: Subject = Field(...)
    context: str = Field(...)
    observed_at: str = Field(..., min_length=1)
    signals: Signals = Field(...)
    evidence_notes: Optional[Dict[str, Any]] = Field(default=None)
    anchor_ref: Optional[str] = Field(
        default=None,
        description=("Optional caller-supplied provenance anchor reference "
                     "(spec §6b). When present the receipt labels the verdict "
                     "`anchored`; otherwise `unanchored`."))
