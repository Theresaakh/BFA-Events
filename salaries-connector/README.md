# Coach sessions → bfa-salaries.pages.dev

Shows each coach's sessions from the attendance app (app.bfa-lebanon.com) on the salaries site:
head-coach sessions, assistant sessions, replacements and absences, per date range.

```
salaries site (browser)  ──>  /api/coach-sessions  (Pages Function on bfa-salaries)  ──>  app.bfa-lebanon.com/api
                                signs in with a dedicated admin account (Cloudflare secret)
```

The attendance app's password never reaches the browser, and the function only reads data.

## Files

| File | Goes where in the salaries site |
|---|---|
| `functions/api/coach-sessions.js` | `functions/api/coach-sessions.js` (next to your `index.html`) |
| `coach-sessions.js` | site root, loaded with `<script src="/coach-sessions.js"></script>` |

## Setup

1. **Create a dedicated admin account** in the attendance app (e.g. `salaries@bfa-lebanon.com`, role *admin*,
   so it sees every branch).
2. **Add the files** above to the folder you upload for bfa-salaries.
3. **Set secrets** in Cloudflare → Workers & Pages → *bfa-salaries* → Settings → Variables and Secrets
   (Production):
   - `BFA_APP_EMAIL`: that account's e-mail
   - `BFA_APP_PASSWORD`: its password (type *Secret*)
   - `SALARIES_KEY` (optional): any long random text. If you set it, also set `BFASessions.key` in the page.
4. **Deploy with Wrangler.** The dashboard's drag-and-drop upload does **not** run the `functions/` folder:
   ```bash
   npx wrangler pages deploy . --project-name bfa-salaries
   ```
   Run it from the salaries site's folder.
5. Check it at `https://bfa-salaries.pages.dev/api/coach-sessions?from=2026-11-01&to=2026-11-30`.

## Using it in the page

```html
<div id="coachSessions"></div>
<script src="/coach-sessions.js"></script>
<script>
  BFASessions.load({ from: "2026-11-01", to: "2026-11-30" /*, branchId: 1 */ })
    .then(function (data) {
      BFASessions.renderTable(document.getElementById("coachSessions"), data);
      // data.coaches[i].total = sessions to pay for that coach, e.g. salary = total * rate
    })
    .catch(function (e) { document.getElementById("coachSessions").textContent = e.message; });
</script>
```

`data.coaches` has one row per person:
`{ name, headPresent, headAbsent, assistantPresent, assistantAbsent, replacements, total, sessions[] }`.

How sessions are counted:

- Head coach marked present: counts for the head coach.
- Head coach absent with a replacement named: counts for the replacement.
- Assistant marked present: counts for the assistant.
- Absences and sessions nobody has marked yet are listed but not counted.

## Limits

- At most 93 days per request (e.g. one month or a quarter).
- Cloudflare's free plan allows 50 outgoing requests per call, so the helper fetches session details
  40 at a time. A month for all branches usually takes a few seconds.
- Field names come from the attendance app's API as used by the BFA admin dashboard
  (`/api/staff-login`, `/api/teams`, `/api/calendar`, `/api/sroster`).
