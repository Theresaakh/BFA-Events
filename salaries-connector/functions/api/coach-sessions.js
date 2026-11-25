// Cloudflare Pages Function for bfa-salaries.pages.dev
//   GET /api/coach-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD[&branchId=0]
//     -> { from, to, sessions: [{ id, date, teamId, teamName, branchId, cancelled }], teams: {...} }
//   GET /api/coach-sessions?ids=501,502,...   (at most 40 ids per call)
//     -> { rosters: [{ sessionId, date, teamId, teamName, coach, coachStatus, coachReplacement,
//                      assistant, assistantStatus }] }
//
// It signs in to app.bfa-lebanon.com with a dedicated admin account kept in Cloudflare secrets,
// so the password never reaches the browser. It only reads from the attendance app.
//
// Settings → Variables and Secrets on the bfa-salaries Pages project:
//   BFA_APP_EMAIL     (secret)   admin account in the attendance app
//   BFA_APP_PASSWORD  (secret)
//   SALARIES_KEY      (secret, optional) if set, callers must send it in the X-Salaries-Key header
//   BFA_APP_URL       (optional) defaults to https://app.bfa-lebanon.com
//
// Sessions and rosters come in two separate calls because Cloudflare's free plan allows only
// 50 outgoing requests per call. The browser helper (coach-sessions.js) splits the work for you.

const MAX_IDS = 40;
const MAX_RANGE_DAYS = 93;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=120", ...extra },
  });

const str = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && v.trim() ? v.trim() : null);
const refId = (v) => (Array.isArray(v) ? str(v[0]) : v && typeof v === "object" ? str(v.id) : typeof v === "number" ? String(v) : null);
const refName = (v) => (Array.isArray(v) ? str(v[1]) : v && typeof v === "object" ? str(v.name) : typeof v === "string" ? str(v) : null);
const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== false && o[k] !== "") return o[k]; };
const list = (x, key) => (Array.isArray(x) ? x : x && Array.isArray(x[key]) ? x[key] : []).filter((i) => i && typeof i === "object");
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const markOf = (v) => {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s === "present" || s === "late" || s === "p") return "present";
  if (s === "absent" || s === "a") return "absent";
  return null;
};

function appClient(env) {
  const base = (env.BFA_APP_URL || "https://app.bfa-lebanon.com").replace(/\/+$/, "");
  let token = null;
  async function call(method, path, body) {
    const res = await fetch(`${base}/api/${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "X-Auth": token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data || data.error) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.path = path.split("?")[0];
      throw err;
    }
    return data;
  }
  return {
    async login() {
      const r = await call("POST", "staff-login", { email: env.BFA_APP_EMAIL, password: env.BFA_APP_PASSWORD, remember: false });
      if (!r.token) throw new Error("The attendance app did not return a sign-in token");
      token = r.token;
    },
    get: (path) => call("GET", path),
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

function mapRoster(sid, r) {
  const asst = Array.isArray(r.assistant) && Array.isArray(r.assistant[0]) ? r.assistant[0] : r.assistant;
  return {
    sessionId: sid,
    date: (str(r.date) || "").slice(0, 10),
    teamId: refId(pick(r, ["teamId", "team_id", "team"])),
    teamName: str(pick(r, ["teamName", "team_name"])) || refName(r.team),
    branchId: str(pick(r, ["branchId", "branch_id"])),
    cancelled: !!r.cancelled,
    coachId: refId(r.coach),
    coach: refName(r.coach),
    coachStatus: markOf(pick(r, ["coachStatus", "coach_status"])),
    coachReplacement: str(pick(r, ["coachReplacement", "replacement"])),
    assistantId: refId(asst),
    assistant: refName(asst),
    assistantStatus: markOf(pick(r, ["assistantStatus", "asstStatus", "assistant_status"])),
    validatedBy: str(pick(r, ["validatedBy", "validated_by"])),
  };
}

export async function onRequestGet({ request, env }) {
  if (env.SALARIES_KEY && request.headers.get("X-Salaries-Key") !== env.SALARIES_KEY) {
    return json({ error: "Not allowed" }, 401);
  }
  if (!env.BFA_APP_EMAIL || !env.BFA_APP_PASSWORD) {
    return json({ error: "BFA_APP_EMAIL / BFA_APP_PASSWORD are not set on this Pages project" }, 500);
  }

  const url = new URL(request.url);
  const app = appClient(env);

  try {
    await app.login();

    // ---- Mode 2: rosters (coach + assistant marks) for specific sessions -------------------
    const idsParam = url.searchParams.get("ids");
    if (idsParam) {
      const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
      if (!ids.length || ids.length > MAX_IDS) return json({ error: `Send between 1 and ${MAX_IDS} session ids` }, 400);
      const rosters = await pool(ids, 4, async (sid) => {
        try { return mapRoster(sid, await app.get(`sroster?sessionId=${sid}`)); }
        catch (e) { return { sessionId: sid, error: e.message }; }
      });
      return json({ rosters });
    }

    // ---- Mode 1: sessions in a date range --------------------------------------------------
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const branchId = /^\d+$/.test(url.searchParams.get("branchId") || "") ? url.searchParams.get("branchId") : "0";
    if (!isDate(from) || !isDate(to) || from > to) return json({ error: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, 400);
    if (addDays(from, MAX_RANGE_DAYS) < to) return json({ error: `Ask for at most ${MAX_RANGE_DAYS} days at a time` }, 400);

    const teamsRes = await app.get(`teams?branchId=${branchId}`);
    const teams = {};
    for (const t of list(teamsRes, "teams")) {
      const id = str(pick(t, ["id", "teamId"]));
      if (!id) continue;
      teams[id] = {
        id,
        name: str(pick(t, ["name", "teamName"])),
        branchId: refId(pick(t, ["branchId", "branch_id", "branch"])),
        coach: refName(pick(t, ["coach", "coachName", "headCoach"])),
        assistant: refName(pick(t, ["assistant", "assistantName", "assistantCoach"])),
      };
    }

    const raw = [];
    for (let start = from; start <= to; start = addDays(start, 31)) {
      const end = addDays(start, 30) < to ? addDays(start, 30) : to;
      raw.push(...list(await app.get(`calendar?branchId=${branchId}&from=${start}&to=${end}`), "sessions"));
    }
    const sessions = raw
      .filter((s) => str(s.id) && str(s.date))
      .map((s) => {
        const teamId = refId(pick(s, ["teamId", "team_id", "team"]));
        return {
          id: str(s.id),
          date: str(s.date).slice(0, 10),
          teamId,
          teamName: (teamId && teams[teamId] && teams[teamId].name) || str(s.teamName) || refName(s.team),
          branchId: refId(pick(s, ["branchId", "branch_id", "branch"])) || (teamId && teams[teamId] ? teams[teamId].branchId : null),
          cancelled: !!s.cancelled,
          validated: s.validated === undefined ? null : !!s.validated,
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return json({ from, to, branchId, sessions, teams });
  } catch (e) {
    const status = 502;
    const hint = e.path === "staff-login" ? " (check BFA_APP_EMAIL / BFA_APP_PASSWORD)" :
      e.status === 401 || e.status === 403 ? " (the account needs the admin role in the attendance app)" : "";
    return json({ error: `Attendance app: ${e.message}${hint}` }, status);
  }
}
