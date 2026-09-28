# x402 adapter — design note (no live charges)

How the Trust Verdict API maps onto an x402 pay-per-verdict surface.
**Design document only.** No payment code ships in this branch, no prices are
set here, and nothing charges anyone. Pricing lives with the x402 menu
owner; this doc only defines the seam.

## Packaging rule (from the Twenty Minds run)

The paid layer sells **scarcity**, never the scoring itself:

| Layer | What's sold | Price home |
|---|---|---|
| Free (this API, community checker) | Scoring: `POST /v1/verdicts`, `GET /v1/health`, `GET /v1/contexts`, OpenAPI | $0, always |
| Paid scarcity | **Verified evidence feeds** (curated, continuously re-verified evidence bundles) and **cryptographically signed verdict receipts** (wallet-signed, on-chain-anchorable) | x402 menu |

The HMAC operator receipt in this API is the *free* integrity mechanism
(symmetric, operator-held secret). The paid receipt is asymmetric:
operator wallet signature over `verdict_hash`, verifiable by anyone against
a published key. That upgrade is the product — not the number.

## Adapter seam

```
                          x402 paywall (Coinbase x402 / facilitator)
                                     |
  client -> POST /x402/v1/verdicts  ->  402 Payment Required (first call)
         -> pays per x402 flow      ->  X-Payment-Response header
         -> adapter verifies payment, forwards to this API's POST /v1/verdicts
         -> returns envelope + { "x402": { "payment_id": ..., "route": "verdicts" } }
```

1. **Adapter service** (separate deploy, e.g. alongside `cwi-x402-api`) sits in
   front of this API. It speaks x402: returns `402` with payment requirements
   on unpaid calls, exactly like the existing paid routes.
2. **Free pass-through:** `GET /v1/health`, `GET /v1/contexts`, and
   `GET /openapi.json` are never paywalled — the community checker stays free
   and inspectable.
3. **Paid route:** `POST /x402/v1/verdicts` maps 1:1 to this API's
   `POST /v1/verdicts`. The adapter:
   - verifies payment via the x402 facilitator flow (no keys handled here),
   - forwards the engine input contract unchanged,
   - returns this API's envelope verbatim, plus an `x402` block recording
     `payment_id` and the route charged — never inventing or altering the
     verdict, score, or `input_sha256`.
4. **Signed-receipt upgrade path:** when the paid tier mints wallet-signed
   receipts, the adapter replaces `receipt.signature` (HMAC, symmetric) with
   the asymmetric signature object; `verdict_hash` stays the binding field so
   old receipts remain verifiable by hash. The free API never mints
   wallet-signed receipts — no wallet signing happens in this codebase.

## What this branch deliberately does NOT include

- No x402 SDK dependency, no facilitator calls, no price constants.
- No wallet, no signing keys, no payment state.
- No change to the engine, its weights, or its refusal semantics.

When Black approves the paid tier, the adapter is a thin new service reusing
this API's contract and its `verify_receipt.py` procedure.
