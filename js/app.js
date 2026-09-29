/* CWI Trust Verdict Checker — UI controller.
 * All user and engine strings are rendered via textContent only.
 * Scoring runs locally in the browser (CWIVerdict.run). Nothing is uploaded.
 * No eval, no innerHTML with dynamic data.
 */
(function () {
  "use strict";

  var ENGINE = window.CWIVerdict;
  var PASTE_MAX = 200000;      // 200 KB paste cap
  var LINK_MAX = 50000;        // 50 KB share-link cap

  /* ---------- safe DOM helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function $(id) { return document.getElementById(id); }

  function safeScroll(elm) {
    try { if (elm && typeof elm.scrollIntoView === "function") elm.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    catch (e) { /* scroll unavailable — non-fatal */ }
  }

  function showError(msg) {
    var box = $("error-box");
    box.textContent = "";
    box.appendChild(el("span", null, msg));
    box.hidden = false;
    safeScroll(box);
  }
  function clearError() { $("error-box").hidden = true; $("error-box").textContent = ""; }

  /* ---------- tabs ---------- */
  var tabs = [
    [$("tab-guided"), $("panel-guided")],
    [$("tab-paste"), $("panel-paste")],
    [$("tab-samples"), $("panel-samples")]
  ];
  tabs.forEach(function (pair) {
    pair[0].addEventListener("click", function () {
      tabs.forEach(function (p) {
        var active = p[0] === pair[0];
        p[0].classList.toggle("active", active);
        p[0].setAttribute("aria-selected", active ? "true" : "false");
        p[1].classList.toggle("active", active);
        p[1].hidden = !active;
      });
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
  function field(label, input, span2) {
    var lab = el("label", "field" + (span2 ? " span2" : ""));
    lab.appendChild(document.createTextNode(label + " "));
    lab.appendChild(input);
    return lab;
  }
  function textInput(ph, maxlen) {
    var i = document.createElement("input");
    i.type = "text"; i.placeholder = ph || ""; i.maxLength = maxlen || 200;
    i.setAttribute("autocomplete", "off");
    return i;
  }

  function addEvidenceRow() {
    evCount++;
    var row = el("div", "ev-row");
    row.setAttribute("data-row", String(evCount));

    var kind = textInput("e.g. erc8004-registration");
    var issuer = textInput("e.g. 0xAgent… or curator name");
    var itype = document.createElement("select");
    selectOpts(itype, [["self", "self — asserted by the agent itself (counts half)"],
                       ["third_party", "third_party — attested by someone else"],
                       ["protocol", "protocol — sealed on a ledger/protocol"]]);
    var status = document.createElement("select");
    selectOpts(status, [["verified", "verified — counts toward the score"],
                        ["claimed", "claimed — contributes zero"],
                        ["pending", "pending — contributes zero"],
                        ["disputed", "disputed — blocks scoring until resolved"],
                        ["refuted", "refuted — contributes zero"]]);
    var wclass = document.createElement("select");
    selectOpts(wclass, [["1", "1 — self-asserted"], ["2", "2 — third-party attested"],
                        ["3", "3 — protocol/ledger sealed"]]);
    var desc = textInput("What is this evidence, concretely?", 500);
    var cluster = textInput("identity cluster (optional — groups Sybil lookalikes)");
    var family = document.createElement("select");
    selectOpts(family, [["erc8004", "erc8004 — identity & registration"],
                        ["needle_drop", "needle_drop — tasks & commercial history"],
                        ["first_spin", "first_spin — published verdicts & reviews"]]);

    row.appendChild(field("Kind *", kind));
    row.appendChild(field("Issuer *", issuer));
    row.appendChild(field("Signal family", family));
    row.appendChild(field("Issuer type", itype));
    row.appendChild(field("Status", status));
    row.appendChild(field("Weight class", wclass));
    row.appendChild(field("Identity cluster", cluster));
    row.appendChild(field("Description *", desc, true));

    var rm = el("button", "btn small ghost ev-remove", "Remove this evidence");
    rm.type = "button";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(rm);

    row._inputs = { kind: kind, issuer: issuer, itype: itype, status: status,
                    wclass: wclass, desc: desc, cluster: cluster, family: family };
    evList.appendChild(row);
    return row;
  }
  $("btn-add-evidence").addEventListener("click", addEvidenceRow);
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
        return { error: "Evidence row " + (r + 1) + ": kind, issuer and description are all required (or remove the row)." };
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

  function scoreDoc(doc) {
    clearError();
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
    var built = buildDocFromGuided();
    if (built.error) { showError(built.error); return; }
    scoreDoc(built.doc);
  });

  $("btn-score-paste").addEventListener("click", function () {
    var raw = $("f-json").value;
    if (raw.length > PASTE_MAX) {
      showError("Input is " + raw.length + " characters — the cap is " + PASTE_MAX + ". Trim it and try again.");
      return;
    }
    var doc;
    try { doc = JSON.parse(raw); }
    catch (e) { showError("That isn't valid JSON: " + e.message); return; }
    scoreDoc(doc);
  });

  /* ---------- samples ---------- */
  (function buildSamples() {
    var grid = $("sample-grid");
    Object.keys(window.CWI_SAMPLES || {}).forEach(function (key) {
      var s = window.CWI_SAMPLES[key];
      var card = el("div", "sample-card");
      card.appendChild(el("h3", null, s.name));
      card.appendChild(el("p", null, s.desc));
      var btn = el("button", "btn", "Load & score →");
      btn.type = "button";
      btn.setAttribute("data-sample", key);
      btn.addEventListener("click", function () { scoreDoc(s.doc); });
      card.appendChild(btn);
      grid.appendChild(card);
    });
  })();

  /* ---------- one-click quickstart: walk the stranger path for them ---------- */
  (function quickstart() {
    var qbtn = $("btn-quickstart");
    if (!qbtn) return;
    qbtn.addEventListener("click", function () {
      var tab = $("tab-samples");
      if (tab) tab.click();
      var sbtn = document.querySelector('#sample-grid [data-sample="established"]');
      if (sbtn) { sbtn.click(); return; }
      showError("Samples failed to load (js/samples.js missing).");
    });
  })();

  /* ---------- verdict card rendering ---------- */
  var STATUS_LABEL = {
    "scored": "SCORED", "insufficient-data": "INSUFFICIENT DATA",
    "evidence-disputed": "EVIDENCE DISPUTED", "unknown-context": "UNKNOWN CONTEXT",
    "invalid-input": "INVALID INPUT"
  };

  function agentLabel(doc) {
    var dn = doc.subject.display_name;
    return dn ? dn + " (" + doc.subject.agent_id + ")" : doc.subject.agent_id;
  }

  function renderResult(doc, out) {
    var card = $("verdict-card");
    card.textContent = "";

    var eyebrow = el("div", "vc-eyebrow");
    var logo = document.createElement("img");
    logo.src = "assets/cwi-logo.jpg"; logo.alt = ""; logo.width = 26; logo.height = 26;
    eyebrow.appendChild(logo);
    eyebrow.appendChild(el("span", null, "Cumulative Web Inc · Trust Verdict Checker"));
    card.appendChild(eyebrow);

    card.appendChild(el("div", "vc-agent", agentLabel(doc)));
    var sub = el("div", "vc-sub");
    sub.textContent = doc.subject.agent_id + " · context " + out.context +
      " · observed " + String(out.observed_at).slice(0, 10);
    card.appendChild(sub);

    var pill = el("span", "vc-status " + out.status, STATUS_LABEL[out.status] || out.status);
    card.appendChild(pill);
    card.appendChild(el("br"));

    if (out.status === "scored") {
      var sc = el("div");
      sc.appendChild(el("span", "vc-score-big", out.score.toFixed(3)));
      sc.appendChild(document.createTextNode("  "));
      sc.appendChild(el("span", "vc-band", "“" + out.band + "”"));
      card.appendChild(sc);
      var meter = el("div", "vc-meter");
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
      box.appendChild(el("h4", null, title));
      var ul = el("ul");
      out.missing.forEach(function (m) { ul.appendChild(el("li", null, m)); });
      box.appendChild(ul);
      card.appendChild(box);
    }

    var meta = el("div", "vc-meta");
    var vt = 0, fams = [];
    Object.keys(out.families || {}).forEach(function (f) {
      var fd = out.families[f];
      vt += fd.verified_count;
      if (fd.verified_count > 0) fams.push(f);
    });
    meta.appendChild(el("span", null, vt + " verified evidence items"));
    meta.appendChild(el("span", null, fams.length + " families with verified evidence"));
    meta.appendChild(el("span", null, "engine v" + out.engine_version + " · spec v" + out.spec_version));
    card.appendChild(meta);

    card.appendChild(el("div", "vc-clause",
      "🛡️ Honesty clause: this engine never invents a score. " +
      "Thin evidence gets “insufficient data”, never a number. Same input → byte-identical output."));

    renderBreakdown(doc, out);
    $("repro-hash").textContent = out.input_sha256 || "(none — invalid input)";
    var dump = $("input-dump");
    var pretty = JSON.stringify(doc, null, 2);
    dump.textContent = pretty.length > 20000 ? pretty.slice(0, 20000) + "\n…(truncated)" : pretty;
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
      block.appendChild(el("h4", null, fam + " — " + fd.verified_count + " verified · " +
        fd.kept_count + " kept · weight " + fd.kept_weight.toFixed(2) +
        " · family score " + fd.family_score.toFixed(3)));
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
          var tdId = el("td", "mono", e.evidence_id);
          var tdIss = el("td", null, e.issuer + " (" + e.issuer_type + ")");
          var tdSt = el("td");
          tdSt.appendChild(el("span", "badge " + e.status, e.status));
          var tdW = el("td", null, "class " + e.weight_class);
          var tdD = el("td", null, String(e.description).slice(0, 90));
          tdD.title = String(e.description);
          tr.appendChild(tdId); tr.appendChild(tdIss); tr.appendChild(tdSt);
          tr.appendChild(tdW); tr.appendChild(tdD);
          table.appendChild(tr);
        });
        block.appendChild(table);
      } else {
        block.appendChild(el("p", "hint", "No evidence submitted in this family."));
      }
      (fd.not_counted || []).forEach(function (nc) {
        block.appendChild(el("p", "hint", "⊘ " + nc.evidence_id + " — " + nc.reason + "."));
      });
      (fd.damped || []).forEach(function (d) {
        block.appendChild(el("p", "hint", "⇄ " + d.evidence_id + " — damped: " + d.detail + "."));
      });
      if ((fd.self_assertion_discounted || []).length)
        block.appendChild(el("p", "hint",
          "½ self-assertion discount applied to: " + fd.self_assertion_discounted.join(", ") + "."));
      host.appendChild(block);
    });
  }

  $("btn-toggle-input").addEventListener("click", function () {
    var dump = $("input-dump");
    dump.hidden = !dump.hidden;
    $("btn-toggle-input").textContent = dump.hidden ? "Show input JSON" : "Hide input JSON";
  });

  /* ---------- share actions ---------- */
  function pageUrl() { return location.href.split("#")[0]; }

  function verdictText() {
    if (!currentDoc || !currentOut) return "";
    var out = currentOut, doc = currentDoc;
    var lines = ["🛡️ Trust verdict — " + agentLabel(doc)];
    if (out.status === "scored") {
      var vt = 0, fc = 0;
      Object.keys(out.families).forEach(function (f) {
        vt += out.families[f].verified_count;
        if (out.families[f].verified_count > 0) fc++;
      });
      lines.push("Status: SCORED · score " + out.score.toFixed(3) + " · band “" + out.band + "”");
      lines.push("Context: " + out.context + " · " + vt + " verified evidence items across " + fc + " families");
    } else {
      lines.push("Status: " + (STATUS_LABEL[out.status] || out.status));
      (out.missing || []).slice(0, 3).forEach(function (m) { lines.push("- " + m); });
    }
    lines.push("Honesty clause: the engine never invents a score.");
    lines.push("input_sha256: " + out.input_sha256);
    lines.push("Check any agent: " + pageUrl());
    lines.push("— Cumulative Web Inc · cumulativeweb.com");
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
      copyText(pageUrl(), "Input too large for a share link — page URL copied instead.");
      return;
    }
    var b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    copyText(pageUrl() + "#v=" + b64, "Share link copied.");
  });

  /* ---------- verdict card PNG (canvas, fillText only) ---------- */
  function fitText(ctx, text, maxW) {
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + "…").width > maxW)
      text = text.slice(0, -1);
    return text + "…";
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
      ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 36, 36, W - 72, H - 72, 28); ctx.fill();

      var x = 96, y = 116;
      // logo, circle-clipped (skipped on taint-retry)
      if (!noLogo) {
        try {
          ctx.save();
          ctx.beginPath(); ctx.arc(x + 30, y - 8, 30, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(logoImg, x, y - 38, 60, 60);
          ctx.restore();
        } catch (e) { /* logo optional on canvas */ }
      }
      ctx.fillStyle = "#6b7280"; ctx.font = "600 24px system-ui, sans-serif";
      ctx.fillText("CUMULATIVE WEB INC · TRUST VERDICT CHECKER", x + 84, y);

      var out = currentOut, doc = currentDoc;
      y = 210;
      ctx.fillStyle = "#11141a"; ctx.font = "800 56px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, agentLabel(doc), 1000), x, y);
      y += 44;
      ctx.fillStyle = "#4b5563"; ctx.font = "400 27px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, doc.subject.agent_id + " · context " + out.context, 1000), x, y);

      y += 66;
      var colors = { "scored": "#16a34a", "insufficient-data": "#d97706",
                     "evidence-disputed": "#dc2626", "unknown-context": "#6b7280",
                     "invalid-input": "#6b7280" };
      var label = STATUS_LABEL[out.status] || out.status;
      ctx.font = "800 30px system-ui, sans-serif";
      var pw = ctx.measureText(label).width + 56;
      ctx.fillStyle = colors[out.status] || "#6b7280";
      roundRect(ctx, x, y - 40, pw, 58, 29); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 28, y);

      y += 66;
      if (out.status === "scored") {
        ctx.fillStyle = "#11141a"; ctx.font = "800 110px system-ui, sans-serif";
        ctx.fillText(out.score.toFixed(3), x, y);
        ctx.font = "700 44px system-ui, sans-serif"; ctx.fillStyle = "#374151";
        ctx.fillText("“" + out.band + "”", x + 330, y - 8);
        y += 30;
        ctx.fillStyle = "#e5e7eb";
        roundRect(ctx, x, y, 1008, 18, 9); ctx.fill();
        ctx.fillStyle = "#16a34a";
        roundRect(ctx, x, y, Math.max(18, 1008 * out.score), 18, 9); ctx.fill();
      } else {
        ctx.fillStyle = "#374151"; ctx.font = "400 27px system-ui, sans-serif";
        (out.missing || []).slice(0, 3).forEach(function (m) {
          ctx.fillText("• " + fitText(ctx, m, 1000), x, y);
          y += 40;
        });
      }

      y = H - 130;
      ctx.fillStyle = "#6b7280"; ctx.font = "400 23px system-ui, sans-serif";
      ctx.fillText("🛡️ Honesty clause: this engine never invents a score.", x, y);
      y += 36;
      ctx.fillText("cumulativeweb.com   ·   input_sha256 " +
        String(out.input_sha256).slice(0, 24) + "…", x, y);

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

  /* include samples script dependency guard */
  if (!window.CWI_SAMPLES) {
    var sg = $("sample-grid");
    sg.textContent = "";
    sg.appendChild(el("p", "hint", "Samples failed to load (js/samples.js missing)."));
  }
})();
