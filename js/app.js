/* CWI Trust Verdict Checker — suite redesign UI controller.
 *
 * VERDICT PATH (live, not stubbed): scoring runs entirely in the browser via
 * window.CWIVerdict (js/verdict-engine.js) — the parity-tested JavaScript port of
 * trust/engine.py. tests/parity.mjs requires byte-identical outputs vs the Python
 * engine on the 20-case gate corpus + a 300-case fuzz set, so the verdicts this
 * page renders ARE the engine's verdicts: same gates, same weights, same
 * input_sha256. No server call, no simulation, nothing invented. If the engine
 * script fails to load, scoring is refused (see the ENGINE guard below).
 *
 * All user and engine strings are rendered via textContent only (no innerHTML
 * with dynamic data). No eval, no network.
 */
(function () {
  "use strict";

  var ENGINE = window.CWIVerdict;
  var PASTE_MAX = 200000;      // 200 KB paste cap
  var LINK_MAX = 50000;        // 50 KB share-link cap

  if (!ENGINE || typeof ENGINE.run !== "function") {
    // Engine failed to load: refuse scoring rather than simulate it.
    document.addEventListener("DOMContentLoaded", function () {
      var box = document.getElementById("error-box");
      if (box) {
        box.textContent = "The verdict engine (js/verdict-engine.js) failed to load. " +
          "Scoring is unavailable — this page will not simulate a verdict.";
        box.hidden = false;
      }
    });
    return;
  }

  /* ---------- safe DOM helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function $(id) { return document.getElementById(id); }

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function safeScroll(node) {
    try {
      if (node && typeof node.scrollIntoView === "function")
        node.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    } catch (e) { /* scroll unavailable — non-fatal */ }
  }

  function showError(msg) {
    var box = $("error-box");
    box.textContent = "";
    box.appendChild(el("span", null, msg));
    box.hidden = false;
    safeScroll(box);
  }
  function clearError() { $("error-box").hidden = true; $("error-box").textContent = ""; }

  /* ---------- tabs (roving tabindex + arrow keys) ---------- */
  var tabs = [
    [$("tab-guided"), $("panel-guided")],
    [$("tab-paste"), $("panel-paste")],
    [$("tab-samples"), $("panel-samples")]
  ];
  function selectTab(idx) {
    tabs.forEach(function (p, i) {
      var active = i === idx;
      p[0].classList.toggle("active", active);
      p[0].setAttribute("aria-selected", active ? "true" : "false");
      p[0].tabIndex = active ? 0 : -1;
      p[1].classList.toggle("active", active);
      p[1].hidden = !active;
    });
  }
  function focusTab(idx) {
    selectTab(idx);
    tabs[idx][0].focus();
  }
  tabs.forEach(function (pair, i) {
    pair[0].addEventListener("click", function () { selectTab(i); });
    pair[0].addEventListener("keydown", function (ev) {
      var n = null;
      if (ev.key === "ArrowRight") n = (i + 1) % tabs.length;
      else if (ev.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === "Home") n = 0;
      else if (ev.key === "End") n = tabs.length - 1;
      if (n !== null) { ev.preventDefault(); focusTab(n); }
    });
  });

  /* ---------- context select ---------- */
  var CONTEXT_ORDER = ["agent-trust", "music-review", "payments"];
  var ctxSel = $("f-context"), ctxHint = $("context-hint");
  CONTEXT_ORDER.forEach(function (c) {
    var opt = el("option", null, c);
    opt.value = c;
    ctxSel.appendChild(opt);
  });
  function refreshCtxHint() {
    var c = ENGINE.CONTEXTS[ctxSel.value];
    ctxHint.textContent = c ? c.description + " Gate: " + c.min_verified +
      "+ verified items across " + c.min_families + "+ families. " + c.rationale : "";
  }
  ctxSel.addEventListener("change", refreshCtxHint);
  refreshCtxHint();

  /* ---------- guided evidence rows ---------- */
  var evList = $("evidence-list");
  var evCount = 0;

  function selectOpts(sel, options) {
    options.forEach(function (o) {
      var opt = el("option", null, o[1]);
      opt.value = o[0];
      sel.appendChild(opt);
    });
  }
  function textInput(id, ph, maxlen) {
    var i = document.createElement("input");
    i.type = "text"; i.id = id; i.placeholder = ph || "";
    i.maxLength = maxlen || 200;
    i.setAttribute("autocomplete", "off");
    return i;
  }
  function labeledField(labelText, input, span2, required) {
    var wrap = el("div", "field" + (span2 ? " span2" : ""));
    var lab = document.createElement("label");
    lab.setAttribute("for", input.id);
    lab.appendChild(document.createTextNode(labelText + " "));
    if (required) {
      var r = el("span", "req", "*");
      r.setAttribute("aria-hidden", "true");
      lab.appendChild(r);
      lab.appendChild(el("span", "visually-hidden", "(required)"));
    }
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function addEvidenceRow() {
    evCount++;
    var n = evCount;
    var fs = document.createElement("fieldset");
    fs.className = "ev-row";
    fs.setAttribute("data-row", String(n));
    fs.appendChild(el("legend", null, "Evidence item " + n));

    var kind = textInput("ev-" + n + "-kind", "e.g. erc8004-registration");
    var issuer = textInput("ev-" + n + "-issuer", "e.g. 0xAgent… or curator name");
    var family = document.createElement("select");
    family.id = "ev-" + n + "-family";
    selectOpts(family, [["erc8004", "erc8004 — identity & registration"],
                        ["needle_drop", "needle_drop — tasks & commercial history"],
                        ["first_spin", "first_spin — published verdicts & reviews"]]);
    var itype = document.createElement("select");
    itype.id = "ev-" + n + "-itype";
    selectOpts(itype, [["self", "self — asserted by the agent itself (counts half)"],
                       ["third_party", "third_party — attested by someone else"],
                       ["protocol", "protocol — sealed on a ledger/protocol"]]);
    var status = document.createElement("select");
    status.id = "ev-" + n + "-status";
    selectOpts(status, [["verified", "verified — counts toward the score"],
                        ["claimed", "claimed — contributes zero"],
                        ["pending", "pending — contributes zero"],
                        ["disputed", "disputed — blocks scoring until resolved"],
                        ["refuted", "refuted — contributes zero"]]);
    var wclass = document.createElement("select");
    wclass.id = "ev-" + n + "-wclass";
    selectOpts(wclass, [["1", "1 — self-asserted"], ["2", "2 — third-party attested"],
                        ["3", "3 — protocol/ledger sealed"]]);
    var cluster = textInput("ev-" + n + "-cluster", "identity cluster (optional — groups Sybil lookalikes)");
    var desc = textInput("ev-" + n + "-desc", "What is this evidence, concretely?", 500);

    fs.appendChild(labeledField("Kind", kind, false, true));
    fs.appendChild(labeledField("Issuer", issuer, false, true));
    fs.appendChild(labeledField("Signal family", family));
    fs.appendChild(labeledField("Issuer type", itype));
    fs.appendChild(labeledField("Status", status));
    fs.appendChild(labeledField("Weight class", wclass));
    fs.appendChild(labeledField("Identity cluster", cluster));
    fs.appendChild(labeledField("Description", desc, true, true));

    var rm = el("button", "btn small ghost ev-remove", "Remove this evidence");
    rm.type = "button";
    rm.setAttribute("aria-label", "Remove evidence item " + n);
    rm.addEventListener("click", function () { fs.remove(); });
    fs.appendChild(rm);

    fs._inputs = { kind: kind, issuer: issuer, itype: itype, status: status,
                   wclass: wclass, desc: desc, cluster: cluster, family: family };
    evList.appendChild(fs);
    return fs;
  }
  $("btn-add-evidence").addEventListener("click", function () {
    var row = addEvidenceRow();
    var first = row.querySelector("input");
    if (first) first.focus();
  });
  addEvidenceRow();

  function buildDocFromGuided() {
    var agentId = $("f-agent-id").value.trim();
    if (!agentId) return { error: "Agent ID is required." };
    var items = [];
    var rows = evList.querySelectorAll(".ev-row");
    for (var r = 0; r < rows.length; r++) {
      var inp = rows[r]._inputs;
      var kind = inp.kind.value.trim(), issuer = inp.issuer.value.trim(),
          desc = inp.desc.value.trim();
      if (!kind && !issuer && !desc) continue; // skip untouched rows
      if (!kind || !issuer || !desc)
        return { error: "Evidence item " + (r + 1) + ": kind, issuer and description are all required (or remove the item)." };
      items.push({
        family: inp.family.value,
        item: {
          evidence_id: "guided-" + (r + 1) + "-" + agentId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40),
          kind: kind, issuer: issuer, issuer_type: inp.itype.value,
          status: inp.status.value, weight_class: parseInt(inp.wclass.value, 10),
          description: desc, observed_at: new Date().toISOString(),
          identity_cluster: inp.cluster.value.trim() || null
        }
      });
    }
    var signals = { erc8004: [], needle_drop: [], first_spin: [] };
    items.forEach(function (e) { signals[e.family].push(e.item); });
    return {
      doc: {
        engine_version: "1.0.0",
        subject: {
          agent_id: agentId,
          display_name: $("f-display").value.trim() || null
        },
        context: ctxSel.value,
        observed_at: new Date().toISOString(),
        signals: signals
      }
    };
  }

  /* ---------- scoring entry points ---------- */
  var currentDoc = null, currentOut = null;

  function setLoading(btn, on) {
    if (on) {
      if (btn.dataset.origLabel === undefined) btn.dataset.origLabel = btn.textContent;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = "Scoring\u2026";
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      if (btn.dataset.origLabel !== undefined) btn.textContent = btn.dataset.origLabel;
    }
  }
  // Run scoring on a timer so the loading state paints before the (synchronous)
  // deterministic computation runs. The state is real: the button is disabled
  // and announced busy until the verdict lands.
  function scoreAsync(btn, buildFn) {
    var built = buildFn();
    if (built.error) { showError(built.error); return; }
    setLoading(btn, true);
    setTimeout(function () {
      try { scoreDoc(built.doc); }
      finally { setLoading(btn, false); }
    }, 30);
  }

  function scoreDoc(doc) {
    clearError();
    $("determinism-out").hidden = true;
    var r;
    try {
      r = ENGINE.run(doc);
    } catch (e) {
      showError("The engine failed on this input: " + e.message);
      return;
    }
    if (r[1] === 2) {
      showError("Invalid input — " + r[0].missing[0]);
      return;
    }
    currentDoc = doc; currentOut = r[0];
    renderResult(doc, r[0]);
  }

  $("btn-score-guided").addEventListener("click", function () {
    scoreAsync(this, buildDocFromGuided);
  });

  $("btn-score-paste").addEventListener("click", function () {
    var btn = this;
    scoreAsync(btn, function () {
      var raw = $("f-json").value;
      if (!raw.trim()) return { error: "Paste the engine input JSON first." };
      if (raw.length > PASTE_MAX)
        return { error: "Input is " + raw.length + " characters — the cap is " + PASTE_MAX + ". Trim it and try again." };
      try { return { doc: JSON.parse(raw) }; }
      catch (e) { return { error: "That isn't valid JSON: " + e.message }; }
    });
  });

  /* ---------- samples ---------- */
  (function buildSamples() {
    var grid = $("sample-grid");
    if (!window.CWI_SAMPLES) {
      grid.appendChild(el("p", "hint", "Samples failed to load (js/samples.js missing)."));
      return;
    }
    Object.keys(window.CWI_SAMPLES).forEach(function (key) {
      var s = window.CWI_SAMPLES[key];
      var card = el("div", "sample-card");
      card.appendChild(el("h3", null, s.name));
      card.appendChild(el("p", null, s.desc));
      var btn = el("button", "btn", "Load & score \u2192");
      btn.type = "button";
      btn.addEventListener("click", function () { scoreDoc(s.doc); });
      card.appendChild(btn);
      grid.appendChild(card);
    });
  })();

  /* ---------- verdict card rendering ---------- */
  var STATUS_LABEL = {
    "scored": "SCORED", "insufficient-data": "INSUFFICIENT DATA",
    "evidence-disputed": "EVIDENCE DISPUTED", "unknown-context": "UNKNOWN CONTEXT"
  };
  var STATUS_HEADLINE = {
    "scored": null,
    "insufficient-data": "No score invented.",
    "evidence-disputed": "Scoring is blocked.",
    "unknown-context": "Unknown context."
  };

  function agentLabel(doc) {
    var dn = doc.subject.display_name;
    return dn ? dn + " (" + doc.subject.agent_id + ")" : doc.subject.agent_id;
  }

  function verifiedTotals(out) {
    var vt = 0, fc = 0;
    Object.keys(out.families || {}).forEach(function (f) {
      vt += out.families[f].verified_count;
      if (out.families[f].verified_count > 0) fc++;
    });
    return { items: vt, families: fc };
  }

  function renderResult(doc, out) {
    var card = $("verdict-card");
    card.textContent = "";
    card.classList.remove("disputed", "thin");
    if (out.status === "evidence-disputed") card.classList.add("disputed");
    if (out.status === "insufficient-data") card.classList.add("thin");

    var eyebrow = el("div", "vc-eyebrow");
    var logo = document.createElement("img");
    logo.src = "assets/cwi-logo.jpg"; logo.alt = ""; logo.width = 26; logo.height = 26;
    eyebrow.appendChild(logo);
    eyebrow.appendChild(el("span", null, "Cumulative Web Inc \u00b7 Trust Verdict Checker"));
    card.appendChild(eyebrow);

    card.appendChild(el("div", "vc-agent", agentLabel(doc)));
    var sub = el("div", "vc-sub");
    sub.textContent = doc.subject.agent_id + " \u00b7 context " + out.context +
      " \u00b7 observed " + String(out.observed_at).slice(0, 10);
    card.appendChild(sub);

    var pill = el("span", "vc-status " + out.status, STATUS_LABEL[out.status] || out.status);
    pill.setAttribute("role", "status");
    card.appendChild(pill);

    var headline = STATUS_HEADLINE[out.status];
    if (headline) card.appendChild(el("div", "vc-band", headline));

    if (out.status === "scored") {
      var sc = el("div");
      sc.appendChild(el("span", "vc-score-big", out.score.toFixed(3)));
      sc.appendChild(document.createTextNode("  "));
      sc.appendChild(el("span", "vc-band", "\u201c" + out.band + "\u201d"));
      card.appendChild(sc);
      var meter = el("div", "vc-meter");
      meter.setAttribute("role", "img");
      meter.setAttribute("aria-label", "Score " + out.score.toFixed(3) + " of 1, band " + out.band);
      var fill = el("div", "vc-meter-fill");
      fill.style.width = (out.score * 100).toFixed(1) + "%";
      meter.appendChild(fill);
      card.appendChild(meter);
      var ticks = el("div", "vc-meter-ticks");
      ["0", "0.20 weak", "0.40 thin", "0.60 emerging", "0.80 established", "1"].forEach(function (t) {
        ticks.appendChild(el("span", null, t));
      });
      card.appendChild(ticks);
    }

    if (out.missing && out.missing.length) {
      var box = el("div", "vc-missing");
      var title = out.status === "insufficient-data" ? "What's missing for a score" :
                  out.status === "evidence-disputed" ? "Why scoring is blocked" : "Problem";
      box.appendChild(el("h3", null, title));
      var ul = el("ul");
      out.missing.forEach(function (m) { ul.appendChild(el("li", null, m)); });
      box.appendChild(ul);
      card.appendChild(box);

      if (out.status === "insufficient-data") {
        var next = el("div", "vc-next");
        next.appendChild(el("p", null,
          "This is the honest outcome — the engine would rather say \u201cinsufficient data\u201d " +
          "than invent a number. Only verified evidence counts: claimed, pending and refuted " +
          "items contribute zero. Add verified attestations, completed work, or published " +
          "verdicts with citable sources and check again."));
        var again = el("button", "btn small gold-outline", "Add verified evidence");
        again.type = "button";
        again.addEventListener("click", function () { focusTab(0); safeScroll($("checker")); });
        next.appendChild(again);
        card.appendChild(next);
      }
      if (out.status === "evidence-disputed") {
        card.appendChild(el("p", "vc-next",
          "A disputed item means someone contests this evidence. Scoring refuses to proceed " +
          "until the dispute is resolved — a score built on contested evidence would be a guess. " +
          "Resolve the dispute with the issuer, then re-check."));
      }
    }

    var meta = el("div", "vc-meta");
    var t = verifiedTotals(out);
    meta.appendChild(el("span", null, t.items + " verified evidence items"));
    meta.appendChild(el("span", null, t.families + " families with verified evidence"));
    meta.appendChild(el("span", null, "engine v" + out.engine_version + " \u00b7 spec v" + out.spec_version));
    card.appendChild(meta);

    var clause = el("div", "vc-clause");
    clause.appendChild(el("strong", null, "\uD83D\uDEE1\uFE0F Honesty clause: "));
    clause.appendChild(document.createTextNode(
      "this engine never invents a score. Thin evidence gets \u201cinsufficient data\u201d, " +
      "never a number. Same input \u2192 byte-identical output."));
    card.appendChild(clause);

    renderBreakdown(doc, out);
    $("repro-hash").textContent = out.input_sha256 || "(none — invalid input)";
    var dump = $("input-dump");
    var pretty = JSON.stringify(doc, null, 2);
    dump.textContent = pretty.length > 20000 ? pretty.slice(0, 20000) + "\n\u2026(truncated)" : pretty;
    dump.hidden = true;
    $("btn-toggle-input").textContent = "Show input JSON";

    $("result").hidden = false;
    safeScroll($("result"));
  }

  function renderBreakdown(doc, out) {
    var host = $("evidence-breakdown");
    host.textContent = "";
    var fams = out.families || {};
    if (!Object.keys(fams).length) {
      host.appendChild(el("p", "hint", "No family detail — the input never reached scoring."));
      return;
    }
    ENGINE.FAMILIES.forEach(function (fam) {
      var fd = fams[fam];
      if (!fd) return;
      var block = el("div", "fam-block");
      block.appendChild(el("h4", null, fam + " — " + fd.verified_count + " verified \u00b7 " +
        fd.kept_count + " kept \u00b7 weight " + fd.kept_weight.toFixed(2) +
        " \u00b7 family score " + fd.family_score.toFixed(3)));
      var items = (doc.signals && doc.signals[fam]) || [];
      if (items.length) {
        var table = el("table", "ev-table");
        var head = el("tr");
        ["evidence", "issuer", "status", "weight", "description"].forEach(function (h) {
          head.appendChild(el("th", null, h));
        });
        table.appendChild(head);
        items.forEach(function (e) {
          var tr = el("tr");
          tr.appendChild(el("td", "mono", e.evidence_id));
          tr.appendChild(el("td", null, e.issuer + " (" + e.issuer_type + ")"));
          var tdSt = el("td");
          tdSt.appendChild(el("span", "badge " + e.status, e.status));
          tr.appendChild(tdSt);
          tr.appendChild(el("td", null, "class " + e.weight_class));
          var tdD = el("td", null, String(e.description).slice(0, 90));
          tdD.title = String(e.description);
          tr.appendChild(tdD);
          table.appendChild(tr);
        });
        block.appendChild(table);
      } else {
        block.appendChild(el("p", "hint", "No evidence submitted in this family."));
      }
      (fd.not_counted || []).forEach(function (nc) {
        block.appendChild(el("p", "hint", "\u2298 " + nc.evidence_id + " — " + nc.reason + "."));
      });
      (fd.damped || []).forEach(function (d) {
        block.appendChild(el("p", "hint", "\u21C4 " + d.evidence_id + " — damped: " + d.detail + "."));
      });
      if ((fd.self_assertion_discounted || []).length)
        block.appendChild(el("p", "hint",
          "\u00BD self-assertion discount applied to: " + fd.self_assertion_discounted.join(", ") + "."));
      host.appendChild(block);
    });
  }

  $("btn-toggle-input").addEventListener("click", function () {
    var dump = $("input-dump");
    dump.hidden = !dump.hidden;
    $("btn-toggle-input").textContent = dump.hidden ? "Show input JSON" : "Hide input JSON";
  });

  /* ---------- share actions ---------- */
  function verdictText() {
    if (!currentDoc || !currentOut) return "";
    var out = currentOut, doc = currentDoc;
    var lines = ["\uD83D\uDEE1\uFE0F Trust verdict — " + agentLabel(doc)];
    if (out.status === "scored") {
      var t = verifiedTotals(out);
      lines.push("Status: SCORED \u00b7 score " + out.score.toFixed(3) + " \u00b7 band \u201c" + out.band + "\u201d");
      lines.push("Context: " + out.context + " \u00b7 " + t.items + " verified evidence items across " + t.families + " families");
    } else {
      lines.push("Status: " + (STATUS_LABEL[out.status] || out.status));
      (out.missing || []).slice(0, 3).forEach(function (m) { lines.push("- " + m); });
    }
    lines.push("Honesty clause: the engine never invents a score.");
    lines.push("input_sha256: " + out.input_sha256);
    lines.push("— Cumulative Web Inc \u00b7 cumulativeweb.com");
    return lines.join("\n");
  }

  function copyText(str, okMsg) {
    var hint = $("share-hint");
    function done(ok) { hint.textContent = ok ? okMsg : "Copy failed — select the text manually."; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(function () { done(true); }, function () { done(false); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = str; document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
  }

  function b64urlEncode(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  $("btn-copy-text").addEventListener("click", function () {
    if (!currentOut) return;
    copyText(verdictText(), "Verdict text copied.");
  });
  $("btn-copy-hash").addEventListener("click", function () {
    if (!currentOut || !currentOut.input_sha256) return;
    copyText(currentOut.input_sha256, "Hash copied.");
  });
  $("btn-copy-link").addEventListener("click", function () {
    if (!currentDoc) return;
    var json = JSON.stringify(currentDoc);
    if (json.length > LINK_MAX) {
      $("share-hint").textContent = "Input exceeds the 50 KB share-link cap.";
      return;
    }
    var url = location.href.split("#")[0] + "#v=" + b64urlEncode(json);
    copyText(url, "Share link copied.");
  });

  /* ---------- verify determinism: run twice more, compare bytes ---------- */
  $("btn-verify-determinism").addEventListener("click", function () {
    var out = $("determinism-out");
    out.hidden = false;
    out.classList.remove("fail");
    out.textContent = "";
    if (!currentDoc || !currentOut) {
      out.textContent = "Score something first, then verify.";
      return;
    }
    try {
      var r1 = ENGINE.run(currentDoc);
      var r2 = ENGINE.run(currentDoc);
      var s0 = ENGINE.canonicalStringify(currentOut);
      var s1 = ENGINE.canonicalStringify(r1[0]);
      var s2 = ENGINE.canonicalStringify(r2[0]);
      var ok = r1[1] === 0 && r2[1] === 0 && s0 === s1 && s1 === s2 &&
               r1[0].input_sha256 === currentOut.input_sha256;
      if (ok) {
        out.appendChild(el("strong", null, "\u2713 Deterministic — "));
        out.appendChild(document.createTextNode(
          "3 runs on this input produced byte-identical output. input_sha256 " +
          String(currentOut.input_sha256).slice(0, 24) + "\u2026"));
      } else {
        out.classList.add("fail");
        out.appendChild(el("strong", null, "\u2717 Mismatch — "));
        out.appendChild(document.createTextNode(
          "two re-runs did not reproduce the verdict byte-for-byte. Do not trust this result; report it."));
      }
    } catch (e) {
      out.classList.add("fail");
      out.textContent = "Verification failed: " + e.message;
    }
  });

  /* ---------- verdict card PNG (canvas, fillText only) ---------- */
  function fitText(ctx, text, maxW) {
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + "\u2026").width > maxW)
      text = text.slice(0, -1);
    return text + "\u2026";
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var logoImg = new Image();
  logoImg.src = "assets/cwi-logo.jpg";

  $("btn-card-png").addEventListener("click", function () {
    if (!currentDoc || !currentOut) return;
    function draw(noLogo) {
      var W = 1200, H = 630;
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var ctx = cv.getContext("2d");
      if (!ctx) { $("share-hint").textContent = "Card PNG isn't supported in this browser."; return; }
      ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, W, H);
      // gold ring, then white card
      ctx.fillStyle = "#d9ab2e";
      roundRect(ctx, 30, 30, W - 60, H - 60, 30); ctx.fill();
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 38, 38, W - 76, H - 76, 24); ctx.fill();

      var x = 96, y = 116;
      if (!noLogo) {
        try {
          ctx.save();
          ctx.beginPath(); ctx.arc(x + 30, y - 8, 30, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(logoImg, x, y - 38, 60, 60);
          ctx.restore();
        } catch (e) { /* logo optional on canvas */ }
      }
      ctx.fillStyle = "#8a6707"; ctx.font = "600 24px system-ui, sans-serif";
      ctx.fillText("CUMULATIVE WEB INC \u00b7 TRUST VERDICT CHECKER", x + 84, y);

      var out = currentOut, doc = currentDoc;
      y = 208;
      ctx.fillStyle = "#141416"; ctx.font = "800 56px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, agentLabel(doc), 1000), x, y);
      y += 44;
      ctx.fillStyle = "#4b5563"; ctx.font = "400 27px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, doc.subject.agent_id + " \u00b7 context " + out.context, 1000), x, y);

      y += 66;
      var colors = { "scored": "#15803d", "insufficient-data": "#b45309",
                     "evidence-disputed": "#b91c1c", "unknown-context": "#4b5563" };
      var label = STATUS_LABEL[out.status] || out.status;
      ctx.font = "800 30px system-ui, sans-serif";
      var pw = ctx.measureText(label).width + 56;
      ctx.fillStyle = colors[out.status] || "#4b5563";
      roundRect(ctx, x, y - 40, pw, 58, 29); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 28, y);

      y += 66;
      if (out.status === "scored") {
        ctx.fillStyle = "#141416"; ctx.font = "800 110px system-ui, sans-serif";
        ctx.fillText(out.score.toFixed(3), x, y);
        ctx.font = "700 44px system-ui, sans-serif"; ctx.fillStyle = "#374151";
        ctx.fillText("\u201c" + out.band + "\u201d", x + 330, y - 8);
        y += 30;
        ctx.fillStyle = "#e9e4d6";
        roundRect(ctx, x, y, 1008, 18, 9); ctx.fill();
        ctx.fillStyle = "#d9ab2e";
        roundRect(ctx, x, y, Math.max(18, 1008 * out.score), 18, 9); ctx.fill();
      } else {
        ctx.fillStyle = "#374151"; ctx.font = "400 27px system-ui, sans-serif";
        (out.missing || []).slice(0, 3).forEach(function (m) {
          ctx.fillText("\u2022 " + fitText(ctx, m, 1000), x, y);
          y += 40;
        });
      }

      y = H - 130;
      ctx.fillStyle = "#6b7280"; ctx.font = "400 23px system-ui, sans-serif";
      ctx.fillText("\uD83D\uDEE1\uFE0F Honesty clause: this engine never invents a score.", x, y);
      y += 36;
      ctx.fillText("cumulativeweb.com   \u00b7   input_sha256 " +
        String(out.input_sha256).slice(0, 24) + "\u2026", x, y);

      var a = document.createElement("a");
      a.download = "trust-verdict-" + doc.subject.agent_id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".png";
      try {
        a.href = cv.toDataURL("image/png");
      } catch (e) {
        if (!noLogo) { draw(true); return; } // tainted by logo: retry clean
        $("share-hint").textContent = "Card PNG isn't supported in this browser.";
        return;
      }
      document.body.appendChild(a); a.click(); a.remove();
      $("share-hint").textContent = "Card PNG downloaded.";
    }
    if (logoImg.complete && logoImg.naturalWidth) draw();
    else { logoImg.onload = draw; logoImg.onerror = draw; }
  });

  /* ---------- deep link: #v=<base64url input> ---------- */
  (function loadFromHash() {
    if (location.hash.indexOf("#v=") !== 0) return;
    try {
      var b64 = location.hash.slice(3).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = decodeURIComponent(escape(atob(b64)));
      if (json.length > LINK_MAX) { showError("Shared input exceeds the 50 KB link cap."); return; }
      var doc = JSON.parse(json);
      scoreDoc(doc);
    } catch (e) {
      showError("That share link couldn't be read: " + e.message);
    }
  })();
})();
