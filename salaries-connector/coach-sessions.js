/*
 * BFA coach sessions: browser helper for bfa-salaries.pages.dev
 *
 *   <script src="/coach-sessions.js"></script>
 *
 *   const data = await BFASessions.load({ from: "2026-11-01", to: "2026-11-30" });
 *   data.sessions -> every non-cancelled session with coach / assistant and their marks
 *   data.coaches  -> one row per person: { name, headPresent, headAbsent, assistantPresent,
 *                    assistantAbsent, replacements, total, sessions: [...] }
 *
 *   BFASessions.renderTable(document.getElementById("coachSessions"), data);
 *
 * Optional: BFASessions.key = "..." when SALARIES_KEY is set on the Pages project.
 *
 * Who gets credit for a session:
 *   - head coach marked present            -> headPresent (+1 total)
 *   - head coach absent, replacement named -> the replacement gets "replacements" (+1 total)
 *   - head coach absent, no replacement    -> headAbsent (not counted in total)
 *   - assistant present / absent           -> assistantPresent / assistantAbsent
 * Sessions nobody has marked yet are listed but don't count toward the totals.
 */
(function (global) {
  "use strict";
  var ENDPOINT = "/api/coach-sessions";
  var BATCH = 40;

  function get(qs) {
    var headers = {};
    if (api.key) headers["X-Salaries-Key"] = api.key;
    return fetch(ENDPOINT + "?" + qs, { headers: headers }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
        return j;
      });
    });
  }

  function load(opts) {
    opts = opts || {};
    var qs = "from=" + opts.from + "&to=" + opts.to + (opts.branchId ? "&branchId=" + opts.branchId : "");
    return get(qs).then(function (cal) {
      var live = cal.sessions.filter(function (s) { return !s.cancelled; });
      var batches = [];
      for (var i = 0; i < live.length; i += BATCH) batches.push(live.slice(i, i + BATCH));
      var rosters = {};
      // Two batches at a time keeps the attendance app quick for coaches using it.
      var idx = 0;
      function next() {
        if (idx >= batches.length) return Promise.resolve();
        var b = batches[idx++];
        if (opts.onProgress) opts.onProgress(Math.min(idx * BATCH, live.length), live.length);
        return get("ids=" + b.map(function (s) { return s.id; }).join(",")).then(function (res) {
          res.rosters.forEach(function (r) { rosters[r.sessionId] = r; });
          return next();
        });
      }
      return Promise.all([next(), next()]).then(function () {
        var sessions = [];
        live.forEach(function (s) {
          var r = rosters[s.id] || {};
          if (r.cancelled) return;
          var team = cal.teams[s.teamId] || {};
          sessions.push({
            id: s.id, date: s.date, teamId: s.teamId, teamName: s.teamName || r.teamName || "",
            branchId: s.branchId,
            coach: r.coach || team.coach || "", coachStatus: r.coachStatus || null,
            coachReplacement: r.coachReplacement || null,
            assistant: r.assistant || team.assistant || "", assistantStatus: r.assistantStatus || null,
            error: r.error || null,
          });
        });
        return { from: cal.from, to: cal.to, sessions: sessions, coaches: summarize(sessions) };
      });
    });
  }

  function summarize(sessions) {
    var by = {};
    function row(name) {
      var k = name.trim().toLowerCase();
      return by[k] || (by[k] = { name: name.trim(), headPresent: 0, headAbsent: 0, assistantPresent: 0,
        assistantAbsent: 0, replacements: 0, total: 0, sessions: [] });
    }
    sessions.forEach(function (s) {
      if (s.coach && s.coachStatus) {
        var c = row(s.coach);
        if (s.coachStatus === "present") { c.headPresent++; c.total++; c.sessions.push({ date: s.date, team: s.teamName, role: "Head coach" }); }
        else {
          c.headAbsent++;
          if (s.coachReplacement) {
            var rp = row(s.coachReplacement);
            rp.replacements++; rp.total++;
            rp.sessions.push({ date: s.date, team: s.teamName, role: "Replacement for " + s.coach });
          }
        }
      }
      if (s.assistant && s.assistantStatus) {
        var a = row(s.assistant);
        if (s.assistantStatus === "present") { a.assistantPresent++; a.total++; a.sessions.push({ date: s.date, team: s.teamName, role: "Assistant" }); }
        else a.assistantAbsent++;
      }
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (x, y) { return x.name.localeCompare(y.name); });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderTable(el, data) {
    if (!data.coaches.length) { el.innerHTML = "<p>No marked sessions between " + esc(data.from) + " and " + esc(data.to) + ".</p>"; return; }
    el.innerHTML =
      '<table class="bfa-coach-sessions"><thead><tr><th>Coach</th><th>Head coach</th><th>Assistant</th>' +
      "<th>Replacements</th><th>Absent</th><th>Sessions paid</th></tr></thead><tbody>" +
      data.coaches.map(function (c, i) {
        return '<tr data-i="' + i + '" style="cursor:pointer"><td>' + esc(c.name) + "</td><td>" + c.headPresent + "</td><td>" +
          c.assistantPresent + "</td><td>" + c.replacements + "</td><td>" + (c.headAbsent + c.assistantAbsent) +
          "</td><td><b>" + c.total + "</b></td></tr>" +
          '<tr class="bfa-detail" data-for="' + i + '" style="display:none"><td colspan="6">' +
          c.sessions.map(function (s) { return esc(s.date) + " · " + esc(s.team) + " · " + esc(s.role); }).join("<br>") +
          "</td></tr>";
      }).join("") + "</tbody></table>";
    Array.prototype.forEach.call(el.querySelectorAll("tr[data-i]"), function (tr) {
      tr.addEventListener("click", function () {
        var d = el.querySelector('tr[data-for="' + tr.getAttribute("data-i") + '"]');
        d.style.display = d.style.display === "none" ? "" : "none";
      });
    });
  }

  var api = { load: load, summarize: summarize, renderTable: renderTable, key: null };
  global.BFASessions = api;
})(typeof window !== "undefined" ? window : globalThis);
