# STB Private Event Pricing Calculator

Internal sales tool for quoting private events. Gated behind Google sign-in,
with access limited to a **managed authorized-users list in Notion**, hosted
on Vercel. People are added/removed by editing the Notion list — no redeploy.

## How it works

- `public/index.html` — public sign-in page (reveals no pricing).
- `api/config.js` — returns the public Google client ID to the sign-in page.
- `api/app.js` — verifies the Google sign-in server-side, confirms the email is
  on the Notion authorized-users list, and only then serves the calculator.
  Reached at `/app`. Fails closed (denies) if the list can't be read.
- `api/allowlist.js` — reads the authorized-users list from Notion at request
  time. See its header for the env vars.
- `api/calc-data.js` — the calculator HTML, base64-bundled so it is never served
  statically (pricing stays server-side until a user is authorized).
- `src/calculator.html` — the editable source of the calculator. **Edit here**,
  then regenerate `api/calc-data.js` (see below).

## Updating the calculator

Edit `src/calculator.html`, then regenerate the bundled copy:

```powershell
$b = [IO.File]::ReadAllBytes("src/calculator.html")
"module.exports = `"$([Convert]::ToBase64String($b))`";" |
  Set-Content api/calc-data.js -Encoding utf8 -NoNewline
```

Commit and push; Vercel redeploys.

## Required Vercel environment variables

- `GOOGLE_CLIENT_ID` — the Google OAuth client ID.
- `NOTION_TOKEN` — Notion integration token with access to the list DB.
- `NOTION_ALLOWED_DS` — data source id (collection UUID) of the authorized-users list.
- `ALLOWED_TOOL` — optional. If the list is shared across tools, set to `Calculator`
  so only rows tagged for the calculator are honored. Leave unset for a
  calculator-only list.

## Authorized-users list (Notion)

A small Notion database. Default property names (overridable via env):

- `Email` (email) — the person's Google sign-in address.
- `Active` (checkbox) — uncheck to revoke access without deleting the row.
- `Tools` (multi-select) — only used if the list is shared; tag rows with
  `Calculator`, `Calendar`, etc.

Add a person: add a row, check `Active`. Remove: uncheck `Active`. No redeploy.

## Google OAuth setup

The deployed Vercel URL must be listed as an **Authorized JavaScript origin**
on the OAuth client in Google Cloud Console.
