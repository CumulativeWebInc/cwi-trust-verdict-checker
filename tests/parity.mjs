#!/usr/bin/env node
/* Parity harness: JS port vs Python engine.py — requires byte-identical outputs.
 * Compares canonical (key-sorted, compact) JSON of both outputs + exit codes
 * + input_sha256, on the 20 gate-corpus inputs and a 300-case fuzz set.
 * Usage: node tests/parity.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CWIVerdict = require("../js/verdict-engine.js");

const PY_DRIVER = [
  "import importlib.util, json, sys",
  "spec = importlib.util.spec_from_file_location('engine', '/tmp/verdict-engine.py')",
  "engine = importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)",
  "doc = json.load(open('/tmp/parity_input.json'))",
  "out, code = engine.run(doc)",
  "sys.stdout.write(json.dumps(out, sort_keys=True, separators=(',', ':'), ensure_ascii=False))",
  "sys.stdout.write(chr(10) + '__CODE__' + str(code))",
].join("\n");

function stable(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function pythonRun(doc) {
  writeFileSync("/tmp/parity_input.json", JSON.stringify(doc));
  const raw = execFileSync("python3", ["-c", PY_DRIVER], { encoding: "utf8" });
  const idx = raw.lastIndexOf("\n__CODE__");
  return { out: JSON.parse(raw.slice(0, idx)), code: parseInt(raw.slice(idx + 9).trim(), 10) };
}

let pass = 0, fail = 0;
const failures = [];

function check(name, doc) {
  let py, jsOut, jsCode;
  try {
    py = pythonRun(doc);
  } catch (e) {
    console.log("PY-ERROR on", name, String(e).slice(0, 200));
    fail++; failures.push(name + " (py-error)"); return;
  }
  try {
    [jsOut, jsCode] = CWIVerdict.run(doc);
  } catch (e) {
    console.log("JS-THROW on", name, String(e).slice(0, 200));
    fail++; failures.push(name + " (js-throw)"); return;
  }
  const ok =
    stable(py.out) === stable(jsOut) &&
    py.code === jsCode &&
    py.out.input_sha256 === jsOut.input_sha256;
  if (ok) { pass++; return; }
  fail++;
  failures.push(name);
  const a = stable(py.out), b = stable(jsOut);
  let d = 0;
  while (d < Math.min(a.length, b.length) && a[d] === b[d]) d++;
  console.log("MISMATCH:", name, "| codes:", py.code, jsCode);
  console.log("  py :", a.slice(Math.max(0, d - 80), d + 120));
  console.log("  js :", b.slice(Math.max(0, d - 80), d + 120));
}

const corpus = JSON.parse(readFileSync("/tmp/gate_corpus_inputs.json", "utf8"));
corpus.forEach((d, i) => check("corpus-" + i, d));

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function rstr(n) {
  const c = "abcdef0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
const ISSUERS = ["self", "third_party", "protocol"];
const STATUSES = ["verified", "claimed", "pending", "disputed", "refuted"];
const CONTEXTS = ["agent-trust", "music-review", "payments", "bogus-ctx"];

for (let t = 0; t < 300; t++) {
  const nFam = () => {
    const arr = [];
    const n = Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const e = {
        evidence_id: "f" + t + "_" + i + "_" + rstr(3),
        kind: rnd(["erc8004-registration", "attestation", "task", "verdict", "seal"]),
        issuer: "issuer_" + rstr(4),
        issuer_type: rnd(ISSUERS),
        status: rnd(STATUSES),
        weight_class: 1 + Math.floor(Math.random() * 3),
        description: "fuzz evidence " + rstr(8),
        observed_at: "2026-09-25T09:30:00Z",
      };
      if (Math.random() < 0.3) e.identity_cluster = "cl_" + rstr(3);
      if (Math.random() < 0.08) e.description = "ünïcödé ✓ emoji 🎲 " + rstr(4);
      arr.push(e);
    }
    return arr;
  };
  const mode = Math.random();
  let doc;
  if (mode < 0.12) {
    doc = { broken: true };
  } else if (mode < 0.18) {
    doc = { engine_version: "9.9.9", subject: { agent_id: "x" }, context: "agent-trust",
            observed_at: "t", signals: { erc8004: [], needle_drop: [], first_spin: [] } };
  } else {
    doc = {
      engine_version: "1.0.0",
      subject: { agent_id: "fuzz_" + rstr(6) },
      context: rnd(CONTEXTS),
      observed_at: "2026-09-25T09:30:00Z",
      signals: { erc8004: nFam(), needle_drop: nFam(), first_spin: nFam() },
    };
    if (Math.random() < 0.5) doc.subject.display_name = "Fuzz " + rstr(3);
    if (Math.random() < 0.1) doc.evidence_notes = { note: "fuzz" };
  }
  check("fuzz-" + t, doc);
}

console.log(`\nparity: ${pass} passed, ${fail} failed`);
if (failures.length) { console.log("failed:", failures.slice(0, 12).join(", ")); process.exit(1); }
console.log("PARITY OK — JS port is byte-identical to engine.py v1.0.0");
