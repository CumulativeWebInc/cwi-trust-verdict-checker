/* CWI Verdict Engine v1.0.0 — JavaScript port of trust/engine.py
 * Deterministic, evidence-bound trust scoring. Same inputs -> identical outputs.
 * Faithful port: IEEE-754 doubles, code-point key ordering, banker's rounding,
 * compact canonical JSON, SHA-256 over UTF-8 bytes. Verified byte-identical
 * against engine.py by tests/parity.mjs. Spec: trust/spec.md v1.0.0.
 * No DOM, no network, no side effects — pure functions only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CWIVerdict = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENGINE_NAME = "cwi-verdict-engine";
  var ENGINE_VERSION = "1.0.0";
  var SPEC_VERSION = "1.0.0";

  var FAMILIES = ["erc8004", "needle_drop", "first_spin"];

  var WEIGHT_CLASSES = { 1: "self-asserted", 2: "third-party-attested", 3: "protocol-or-ledger-sealed" };

  var SELF_ASSERTION_FACTOR = 0.5;
  var ISSUER_CAP_PER_FAMILY = 2;
  var SATURATION_K = 3.0;

  var CONTEXTS = {
    "agent-trust": {
      description: "General trust in an agent as an ecosystem participant.",
      min_verified: 3, min_families: 2,
      required_families: ["erc8004"], required_any_of: [],
      rationale: "General trust requires an anchored identity (ERC-8004) plus corroboration from at least one more family."
    },
    "music-review": {
      description: "Trust in an agent as a music evaluator/curator.",
      min_verified: 2, min_families: 1,
      required_families: [], required_any_of: ["first_spin", "needle_drop"],
      rationale: "Music-domain trust requires music-domain evidence: published First Spin verdicts or verified Needle Drop history."
    },
    "payments": {
      description: "Trust in an agent as a payment counterparty.",
      min_verified: 2, min_families: 2,
      required_families: ["erc8004", "needle_drop"], required_any_of: [],
      rationale: "Payments require a verifiable identity anchor plus completed commercial history."
    }
  };

  var BANDS = [
    [0.80, "established"], [0.60, "emerging"], [0.40, "thin"],
    [0.20, "weak"], [0.00, "negligible"]
  ];

  var VALID_STATUSES = ["verified", "claimed", "pending", "disputed", "refuted"];
  var VALID_ISSUER_TYPES = ["self", "third_party", "protocol"];

  /* ---- SHA-256 (compact, public-domain style implementation) ---- */
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var ml = bytes.length;
    var bitLenHi = Math.floor(ml / 0x20000000), bitLenLo = (ml << 3) >>> 0;
    var padded = ml + 1 + 8;
    var rem = padded % 64; if (rem) padded += 64 - rem;
    var m = new Uint8Array(padded);
    m.set(bytes); m[ml] = 0x80;
    var o = padded - 8;
    m[o] = (bitLenHi >>> 24) & 0xff; m[o + 1] = (bitLenHi >>> 16) & 0xff;
    m[o + 2] = (bitLenHi >>> 8) & 0xff; m[o + 3] = bitLenHi & 0xff;
    m[o + 4] = (bitLenLo >>> 24) & 0xff; m[o + 5] = (bitLenLo >>> 16) & 0xff;
    m[o + 6] = (bitLenLo >>> 8) & 0xff; m[o + 7] = bitLenLo & 0xff;
    var w = new Array(64);
    for (var b = 0; b < padded; b += 64) {
      for (var i = 0; i < 16; i++)
        w[i] = (m[b + i * 4] << 24) | (m[b + i * 4 + 1] << 16) | (m[b + i * 4 + 2] << 8) | m[b + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], bb2 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & bb2) ^ (a & c) ^ (bb2 & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb2; bb2 = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb2) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) {
      var v = H[i] >>> 0;
      out += ("00000000" + v.toString(16)).slice(-8);
    }
    return out;
  }
  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var utf8 = unescape(encodeURIComponent(str));
    var arr = new Uint8Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i);
    return arr;
  }

  /* ---- canonical JSON: code-point key order, compact separators ---- */
  function cmpCodePoints(a, b) {
    var aa = Array.from(a), bb = Array.from(b);
    var n = Math.min(aa.length, bb.length);
    for (var i = 0; i < n; i++) {
      var x = aa[i].codePointAt(0), y = bb[i].codePointAt(0);
      if (x !== y) return x - y;
    }
    return aa.length - bb.length;
  }
  function canonicalStringify(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "[" + v.map(canonicalStringify).join(",") + "]";
    if (typeof v === "object") {
      var keys = Object.keys(v).sort(cmpCodePoints);
      return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + canonicalStringify(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v);
  }
  function canonicalHash(doc) {
    return sha256Bytes(utf8Bytes(canonicalStringify(doc)));
  }

  /* ---- Python round(x, 3): round-half-to-even on the binary value ---- */
  function pyRound3(x) {
    var scaled = x * 1000;
    var fl = Math.floor(scaled);
    var diff = scaled - fl;
    if (Math.abs(diff - 0.5) < 1e-9) return (fl % 2 === 0 ? fl : fl + 1) / 1000;
    return Math.round(scaled) / 1000;
  }

  /* ---- validation: same rules and messages as engine.py ---- */
  function isObj(v) { return typeof v === "object" && v !== null && !Array.isArray(v); }
  function nonEmptyStr(v) { return typeof v === "string" && v.length > 0; }

  function validate(doc) {
    if (!isObj(doc)) return "input must be a JSON object";
    if (doc.engine_version !== ENGINE_VERSION)
      return "engine_version must be " + pyRepr(ENGINE_VERSION) + ", got " + pyRepr(doc.engine_version);
    var subject = doc.subject;
    if (!isObj(subject) || !nonEmptyStr(subject.agent_id))
      return "subject.agent_id must be a non-empty string";
    if (typeof doc.context !== "string") return "context must be a string";
    if (!nonEmptyStr(doc.observed_at))
      return "observed_at must be a non-empty string (ISO-8601)";
    var signals = doc.signals;
    if (!isObj(signals)) return "signals must be an object";
    var sk = Object.keys(signals).sort(cmpCodePoints), fk = FAMILIES.slice().sort(cmpCodePoints);
    if (JSON.stringify(sk) !== JSON.stringify(fk))
      return "signals must contain exactly the families " + pyListRepr(FAMILIES) + ", got " + pyListRepr(sk);
    for (var fi = 0; fi < FAMILIES.length; fi++) {
      var fam = FAMILIES[fi], items = signals[fam];
      if (!Array.isArray(items)) return "signals." + fam + " must be a list";
      var seen = {};
      for (var i = 0; i < items.length; i++) {
        var e = items[i], where = "signals." + fam + "[" + i + "]";
        if (!isObj(e)) return where + " must be an object";
        var eid = e.evidence_id;
        if (!nonEmptyStr(eid)) return where + ".evidence_id must be a non-empty string";
        if (seen[eid]) return where + ": duplicate evidence_id " + pyRepr(eid);
        seen[eid] = 1;
        var ff, okf = true;
        var reqFields = ["kind", "issuer", "description"];
        for (var r = 0; r < reqFields.length; r++) {
          ff = reqFields[r];
          if (!nonEmptyStr(e[ff])) { okf = false; break; }
        }
        if (!okf) return where + "." + ff + " must be a non-empty string";
        if (VALID_ISSUER_TYPES.indexOf(e.issuer_type) < 0)
          return where + ".issuer_type must be one of " + pyListRepr(VALID_ISSUER_TYPES);
        if (VALID_STATUSES.indexOf(e.status) < 0)
          return where + ".status must be one of " + pyListRepr(VALID_STATUSES);
        if (!(e.weight_class === 1 || e.weight_class === 2 || e.weight_class === 3))
          return where + ".weight_class must be one of [1, 2, 3]";
        if (!nonEmptyStr(e.observed_at)) return where + ".observed_at must be a non-empty string";
        var cluster = e.identity_cluster;
        if (cluster !== undefined && cluster !== null && !nonEmptyStr(cluster))
          return where + ".identity_cluster must be a non-empty string or null";
      }
    }
    var notes = doc.evidence_notes;
    if (notes !== undefined && notes !== null && !isObj(notes))
      return "evidence_notes must be an object if present";
    return null;
  }

  function cmpStr(a, b) { return cmpCodePoints(a, b); }

  /* ---- per-family admission + Sybil damping ---- */
  function processFamily(items) {
    var verified = [], notCounted = [];
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      if (e.status === "verified") verified.push(e);
      else notCounted.push({ evidence_id: e.evidence_id, status: e.status, reason: "status is not verified — contributes 0" });
    }
    notCounted.sort(function (a, b) { return cmpStr(a.evidence_id, b.evidence_id); });

    var groups = {};
    for (i = 0; i < verified.length; i++) {
      e = verified[i];
      var key = e.identity_cluster || ("issuer:" + e.issuer);
      (groups[key] = groups[key] || []).push(e);
    }
    var kept = [], damped = [];
    Object.keys(groups).sort(cmpCodePoints).forEach(function (key) {
      var members = groups[key].slice().sort(function (a, b) {
        return (b.weight_class - a.weight_class) || cmpStr(a.evidence_id, b.evidence_id);
      });
      for (var j = 0; j < members.length; j++) {
        e = members[j];
        if (j < ISSUER_CAP_PER_FAMILY) {
          var isSelf = e.issuer_type === "self";
          kept.push({ e: e, w: e.weight_class * (isSelf ? SELF_ASSERTION_FACTOR : 1.0), self: isSelf });
        } else {
          damped.push({ evidence_id: e.evidence_id, reason: "issuer-cap",
            detail: "identity cluster " + pyRepr(key) + " exceeds cap of " + ISSUER_CAP_PER_FAMILY + " verified items per family" });
        }
      }
    });
    kept.sort(function (a, b) { return cmpStr(a.e.evidence_id, b.e.evidence_id); });
    damped.sort(function (a, b) { return cmpStr(a.evidence_id, b.evidence_id); });

    var keptWeight = 0, selfDiscounted = [], keptIds = [];
    for (i = 0; i < kept.length; i++) {
      keptWeight += kept[i].w;
      if (kept[i].self) selfDiscounted.push(kept[i].e.evidence_id);
      keptIds.push(kept[i].e.evidence_id);
    }
    return {
      evidence_submitted: items.length,
      verified_count: verified.length,
      kept_count: kept.length,
      kept_weight: keptWeight,
      self_assertion_discounted: selfDiscounted,
      damped: damped,
      not_counted: notCounted,
      kept_evidence_ids: keptIds,
      family_score: keptWeight / (keptWeight + SATURATION_K)
    };
  }

  function bandFor(score) {
    for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i][0]) return BANDS[i][1];
    return "negligible";
  }

  /* ---- Python repr helpers (for byte-identical messages) ---- */
  function pyReprStr(s) {
    if (s.indexOf("'") < 0) return "'" + s.replace(/\\/g, "\\\\") + "'";
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  function pyRepr(v) {
    if (typeof v === "string") return pyReprStr(v);
    if (v === null || v === undefined) return "None";
    return JSON.stringify(v);
  }
  function pyListRepr(arr) {
    return "[" + arr.map(pyReprStr).join(", ") + "]";
  }

  /* ---- main scoring ---- */
  function score(doc) {
    var context = doc.context;
    var inputSha = canonicalHash(doc);
    var base = {
      engine: ENGINE_NAME, engine_version: ENGINE_VERSION, spec_version: SPEC_VERSION,
      subject: { agent_id: doc.subject.agent_id, display_name: doc.subject.display_name === undefined ? null : doc.subject.display_name },
      context: context, observed_at: doc.observed_at, input_sha256: inputSha
    };
    // NOTE: Python's doc["subject"].get("display_name") -> None when absent.
    // JSON output renders None as null; parity harness compares parsed objects.

    if (!CONTEXTS.hasOwnProperty(context)) {
      base.status = "unknown-context"; base.score = null; base.band = null;
      base.missing = ["context " + pyRepr(context) + " is not in the context registry " +
        pyListRepr(Object.keys(CONTEXTS).sort(cmpCodePoints))];
      base.families = {}; base.notes = doc.evidence_notes || {};
      return base;
    }

    var disputedSeen = {};
    for (var fi = 0; fi < FAMILIES.length; fi++) {
      var items = doc.signals[FAMILIES[fi]];
      for (var i = 0; i < items.length; i++)
        if (items[i].status === "disputed") disputedSeen[items[i].evidence_id] = 1;
    }
    var disputed = Object.keys(disputedSeen).sort(cmpCodePoints);
    var families = {};
    for (fi = 0; fi < FAMILIES.length; fi++) families[FAMILIES[fi]] = processFamily(doc.signals[FAMILIES[fi]]);

    if (disputed.length) {
      base.status = "evidence-disputed"; base.score = null; base.band = null;
      base.missing = ["resolve disputed evidence before scoring: " + disputed.join(", ")];
      base.families = families; base.notes = doc.evidence_notes || {};
      return base;
    }

    var cfg = CONTEXTS[context];
    var verifiedTotal = 0, famsWithVerified = [];
    for (fi = 0; fi < FAMILIES.length; fi++) {
      verifiedTotal += families[FAMILIES[fi]].verified_count;
      if (families[FAMILIES[fi]].verified_count > 0) famsWithVerified.push(FAMILIES[fi]);
    }
    famsWithVerified.sort(cmpCodePoints);

    var missing = [];
    for (var r = 0; r < cfg.required_families.length; r++) {
      var rf = cfg.required_families[r];
      if (families[rf].verified_count === 0)
        missing.push(rf + ": 0 verified evidence items (required by context " + pyRepr(context) + ")");
    }
    if (cfg.required_any_of.length) {
      var anyOk = false;
      for (r = 0; r < cfg.required_any_of.length; r++)
        if (families[cfg.required_any_of[r]].verified_count > 0) { anyOk = true; break; }
      if (!anyOk)
        missing.push("none of " + pyListRepr(cfg.required_any_of) +
          " has verified evidence (context " + pyRepr(context) + " requires at least one)");
    }
    if (verifiedTotal < cfg.min_verified)
      missing.push("verified evidence items: " + verifiedTotal + " found, " + cfg.min_verified +
        " required by context " + pyRepr(context));
    if (famsWithVerified.length < cfg.min_families)
      missing.push("families with verified evidence: " + famsWithVerified.length + " found, " +
        cfg.min_families + " required by context " + pyRepr(context));

    base.gate = {
      min_verified: cfg.min_verified, verified_found: verifiedTotal,
      min_families: cfg.min_families, families_with_verified: famsWithVerified,
      required_families: cfg.required_families.slice(),
      required_any_of: cfg.required_any_of.slice(),
      rationale: cfg.rationale, met: missing.length === 0
    };

    if (missing.length) {
      base.status = "insufficient-data"; base.score = null; base.band = null;
      base.missing = missing; base.families = families; base.notes = doc.evidence_notes || {};
      return base;
    }

    var scored = [];
    for (fi = 0; fi < FAMILIES.length; fi++)
      if (families[FAMILIES[fi]].kept_count > 0) scored.push(families[FAMILIES[fi]].family_score);
    var total = 0;
    for (i = 0; i < scored.length; i++) total += scored[i];
    var final = pyRound3(total / scored.length);
    base.status = "scored"; base.score = final; base.band = bandFor(final);
    base.missing = []; base.families = families; base.notes = doc.evidence_notes || {};
    return base;
  }

  function run(doc) {
    var err = validate(doc);
    if (err !== null) {
      return [{
        engine: ENGINE_NAME, engine_version: ENGINE_VERSION, spec_version: SPEC_VERSION,
        subject: isObj(doc) ? (doc.subject === undefined ? null : doc.subject) : null,
        context: isObj(doc) ? (doc.context === undefined ? null : doc.context) : null,
        observed_at: isObj(doc) ? (doc.observed_at === undefined ? null : doc.observed_at) : null,
        input_sha256: null, status: "invalid-input", score: null, band: null,
        missing: [err], families: {}, notes: {}
      }, 2];
    }
    return [score(doc), 0];
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION, SPEC_VERSION: SPEC_VERSION,
    CONTEXTS: CONTEXTS, FAMILIES: FAMILIES, WEIGHT_CLASSES: WEIGHT_CLASSES,
    BANDS: BANDS, VALID_STATUSES: VALID_STATUSES, VALID_ISSUER_TYPES: VALID_ISSUER_TYPES,
    validate: validate, score: score, run: run,
    canonicalHash: canonicalHash, canonicalStringify: canonicalStringify,
    sha256Hex: function (s) { return sha256Bytes(utf8Bytes(s)); }
  };
});
