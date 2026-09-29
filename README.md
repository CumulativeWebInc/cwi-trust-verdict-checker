# Trust Verdict Checker

Deterministic, evidence-bound trust scoring for AI agents — from Cumulative Web Inc's
[SANQA suite](https://cumulativeweb.com/sanqa/).

- **Try it in your browser:** this repo deploys to
  [cumulativewebinc.github.io/cwi-trust-verdict-checker](https://cumulativewebinc.github.io/cwi-trust-verdict-checker/)
  — scoring runs locally in the page, nothing is uploaded.
- **Equip an agent in one command** (below): fetch the CWI Verdict Engine (v1.0.0,
  stdlib-only Python) and score trust on your own machine. No auth, no API keys, $0.

## Equip an agent — one command

Paste this in any shell that has `curl` and `python3`:

```bash
mkdir -p trust-verdict && cd trust-verdict \
&& curl -sL https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/engine.py -o verdict-engine.py \
&& curl -sL https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/spec.md -o spec.md \
&& python3 -c 'print("{\"engine_version\":\"1.0.0\",\"subject\":{\"agent_id\":\"YOUR_AGENT_ID\",\"display_name\":\"Your display name\"},\"context\":\"agent-trust\",\"observed_at\":\"2026-09-29T08:40:00Z\",\"signals\":{\"erc8004\":[],\"needle_drop\":[],\"first_spin\":[]}}")' | python3 verdict-engine.py
```

Expected result: `"status": "insufficient-data"` with `"score": null`. That is the engine
working correctly — with no evidence supplied it refuses to invent a score. To get a real
verdict, replace `YOUR_AGENT_ID` with your agent id and add real evidence items under
`signals` (full schema in `spec.md` §3 — ERC-8004 identity, Needle Drop history,
First Spin published verdicts).

Verify determinism any time: run the engine twice on the same input and diff the bytes —
identical inputs always produce byte-identical outputs.

## How to score

```bash
python3 verdict-engine.py < input.json > output.json
```

`input.json` follows `trust/spec.md` §3. Every output carries an `input_sha256` — cite it
when reporting a score so the result is reproducible.

The engine's hard rules (from the spec):

- Insufficient evidence yields `insufficient-data`, never a number.
- Disputed evidence yields `evidence-disputed` and refuses the whole run.
- Only `verified` evidence counts toward a score; `claimed`/`pending`/`refuted` count zero.
- Self-asserted evidence is discounted (Sybil-damped).

Present refusal statuses as-is — never as a number. That honesty is the product.

## Source

The engine and spec live in the
[CumulativeWebInc/cwi-learn](https://github.com/CumulativeWebInc/cwi-learn) repo under
`trust/` (branch `needs/verdict-engine` pending merge, then `main`).

Browser UI: [`index.html`](./index.html) + [`js/`](./js) — the same deterministic logic,
running client-side. Tests: [`tests/`](./tests).

— Cumulative Web Inc · Free to equip · $0 forever
