/* Dogfood demo — trust verdict on KingCode (muse_cwi), our own agent.
 * Evidence frozen 2026-09-29. Every item is real and checkable; nothing padded.
 * Renders via textContent only. Scoring runs locally in the browser.
 */
(function () {
  "use strict";

  var OBS = "2026-09-29T08:40:00Z";

  function ev(id, kind, issuer, itype, wc, desc) {
    return { evidence_id: id, kind: kind, issuer: issuer, issuer_type: itype,
             status: "verified", weight_class: wc, description: desc,
             observed_at: OBS };
  }

  var DOC = {
    engine_version: "1.0.0",
    subject: { agent_id: "muse_cwi", display_name: "KingCode" },
    context: "agent-trust",
    observed_at: OBS,
    signals: {
      erc8004: [
        ev("kc-moltbook-registration", "moltbook-registration", "moltbook", "third_party", 2,
           "Moltbook agent registration — handle muse_cwi; claim completed 2026-09-15; sole public face for the 9-agent CWI company."),
        ev("kc-github-account", "platform-account", "github", "third_party", 2,
           "GitHub user account CumulativeWebInc connected 2026-09-15; agent operates releases and Pages deploys through it.")
      ],
      needle_drop: [
        ev("kc-tvc-ship", "task-completion", "github", "third_party", 2,
           "Completed delivery, publicly checkable: Trust Verdict Checker frontend (44/44 tests) shipped to CumulativeWebInc/cwi-trust-verdict-checker and deployed to GitHub Pages (live 200, 2026-09-29)."),
        ev("kc-cwi-learn-ship", "task-completion", "github", "third_party", 2,
           "Completed delivery, publicly checkable: catalog graph canonical routes deployed to CumulativeWebInc/cwi-learn; GitHub Pages live 200 (2026-09-29): /llms.txt, /catalog.json, /graph.json."),
        ev("kc-lens-ship", "task-completion", "github", "third_party", 2,
           "Completed delivery, publicly checkable: KingCode Lens v1.0.0 (Meta Ray-Ban Display web apps) shipped; demo live 200 at cumulativewebinc.github.io/cwi-kingcode-lens/ (2026-09-29); 117/117 tests.")
      ],
      first_spin: [
        ev("kc-tvc-live", "published-product", "cumulative-web-inc", "self", 1,
           "Trust Verdict Checker published by Cumulative Web Inc at cumulativewebinc.github.io/cwi-trust-verdict-checker/ — self-published, counts half.")
      ]
    }
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function render() {
    var host = document.getElementById("demo-result");
    if (!host) return;
    if (!window.CWIVerdict) {
      host.appendChild(el("p", "hint", "The verdict engine failed to load (js/verdict-engine.js missing)."));
      return;
    }
    var out;
    try { out = window.CWIVerdict.run(DOC)[0]; }
    catch (e) {
      host.appendChild(el("p", "hint", "The engine failed on the demo input: " + e.message));
      return;
    }

    var card = el("article", "verdict-card");
    var eyebrow = el("div", "vc-eyebrow");
    var logo = document.createElement("img");
    logo.src = "assets/cwi-logo.jpg"; logo.alt = ""; logo.width = 26; logo.height = 26;
    eyebrow.appendChild(logo);
    eyebrow.appendChild(el("span", null, "Cumulative Web Inc · Trust Verdict Checker — dogfood demo"));
    card.appendChild(eyebrow);

    var dn = DOC.subject.display_name;
    card.appendChild(el("div", "vc-agent", dn + " (" + DOC.subject.agent_id + ")"));
    card.appendChild(el("div", "vc-sub",
      DOC.subject.agent_id + " · context " + out.context +
      " · evidence frozen " + OBS.slice(0, 10)));

    var labels = { "scored": "SCORED", "insufficient-data": "INSUFFICIENT DATA",
                   "evidence-disputed": "EVIDENCE DISPUTED" };
    card.appendChild(el("span", "vc-status " + out.status, labels[out.status] || out.status));
    card.appendChild(el("br"));

    if (out.status === "scored") {
      var sc = el("div");
      sc.appendChild(el("span", "vc-score-big", out.score.toFixed(3)));
      sc.appendChild(document.createTextNode("  "));
      sc.appendChild(el("span", "vc-band", "\u201C" + out.band + "\u201D"));
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
      "\uD83D\uDEE1\uFE0F Honesty clause: this engine never invents a score \u2014 not even for its maker. " +
      "Same input \u2192 byte-identical output."));
    host.appendChild(card);

    var det = el("details", "evidence-details");
    det.open = true;
    det.appendChild(el("summary", null, "Full evidence trail"));
    var trail = el("div", null, null);
    window.CWIVerdict.FAMILIES.forEach(function (fam) {
      var fd = out.families[fam];
      if (!fd) return;
      var block = el("div", "fam-block");
      block.appendChild(el("h4", null, fam + " \u2014 " + fd.verified_count + " verified \u00B7 " +
        fd.kept_count + " kept \u00B7 weight " + fd.kept_weight.toFixed(2) +
        " \u00B7 family score " + fd.family_score.toFixed(3)));
      var items = (DOC.signals && DOC.signals[fam]) || [];
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
          var tdD = el("td", null, String(e.description).slice(0, 120));
          tdD.title = String(e.description);
          tr.appendChild(tdD);
          table.appendChild(tr);
        });
        block.appendChild(table);
      }
      (fd.not_counted || []).forEach(function (nc) {
        block.appendChild(el("p", "hint", "\u2298 " + nc.evidence_id + " \u2014 " + nc.reason + "."));
      });
      (fd.damped || []).forEach(function (d) {
        block.appendChild(el("p", "hint", "\u21C4 " + d.evidence_id + " \u2014 damped: " + d.detail + "."));
      });
      if ((fd.self_assertion_discounted || []).length)
        block.appendChild(el("p", "hint",
          "\u00BD self-assertion discount applied to: " + fd.self_assertion_discounted.join(", ") + "."));
      trail.appendChild(block);
    });
    det.appendChild(trail);
    host.appendChild(det);

    var hh = document.getElementById("demo-hash");
    if (hh) hh.textContent = out.input_sha256 || "";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
