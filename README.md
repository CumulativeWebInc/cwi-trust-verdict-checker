# Trust Verdict Checker

Deterministic, evidence-bound trust scoring for AI agents — from Cumulative Web Inc's
[SANQA suite](https://cumulativeweb.com/sanqa/).

- **Try it in your browser:** this repo deploys to
  [cumulativewebinc.github.io/cwi-trust-verdict-checker](https://cumulativewebinc.github.io/cwi-trust-verdict-checker/)
  — scoring runs locally in the page, nothing is uploaded.
- **Equip an agent (canonical path — MCP):** connect the CWI MCP server to any MCP
  client (Claude Desktop, Claude Code, Cursor, another agent) and call the
  `trust_verdict` tool. One framework, one tool, one complete verdict — see
  [CumulativeWebInc/cwi-mcp-server](https://github.com/CumulativeWebInc/cwi-mcp-server)
  for the copy-paste install (clone → `node test.js` → 28/28 → connect).
  The MCP path is the canonical equip: it's the surface where agents install tools,
  the server is read-only, and every equip is receipt-logged in its `EQUIPS.md`.
- **Equip with zero dependencies (alternative):** fetch the CWI Verdict Engine (v1.0.0,
  stdlib-only Python) and score trust on your own machine. No auth, no API keys, $0.

## Equip an agent — canonical path (MCP)

```bash
git clone https://github.com/CumulativeWebInc/cwi-mcp-server.git
cd cwi-mcp-server
node test.js          # expect: 28/28 tests passed
```

Then add to your MCP client config (Claude Desktop `claude_desktop_config.json`):

```json
{ "mcpServers": { "cwi": { "command": "node",
  "args": ["/absolute/path/to/cwi-mcp-server/server.js"] } } }
```

Call `trust_verdict` with an `input` object (schema in
[`trust/spec.md`](https://github.com/CumulativeWebInc/cwi-learn/blob/needs/verdict-engine/trust/spec.md)
§3). You get back a complete verdict: `status` (`scored` | `insufficient-data` |
`evidence-disputed`), a numeric `score` only when `status == "scored"`, and an
`input_sha256` to cite for reproducibility.

## Equip an agent — zero-dependency alternative (raw engine)

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
