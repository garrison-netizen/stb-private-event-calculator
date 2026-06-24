# STB Private Event Pricing Calculator

Internal sales tool for quoting private events. Gated behind Google sign-in
restricted to **@spindletap.com** accounts, hosted on Vercel.

## How it works

- `public/index.html` — public sign-in page (reveals no pricing).
- `api/config.js` — returns the public Google client ID to the sign-in page.
- `api/app.js` — verifies the Google sign-in server-side, checks the email is
  `@spindletap.com`, and only then serves the calculator. Reached at `/app`.
- `api/calc-data.js` — the calculator HTML, base64-bundled so it is never served
  statically (pricing stays server-side until a user is authenticated).
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
- `ALLOWED_DOMAIN` — defaults to `spindletap.com` if unset.

## Google OAuth setup

The deployed Vercel URL must be listed as an **Authorized JavaScript origin**
on the OAuth client in Google Cloud Console.
