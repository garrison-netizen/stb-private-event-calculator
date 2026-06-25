// Authenticated gate for the Private Event Pricing Calculator.
// Serves the calculator HTML only after verifying a Google sign-in
// AND confirming the signed-in email is on the Notion authorized-users
// list. The pricing markup lives in calc-data.js (bundled, not publicly
// served), so nothing is sent to the browser until the caller is allowed.
const { OAuth2Client } = require('google-auth-library');
const { fetchAllowedEmails } = require('./allowlist.js');
const calcB64 = require('./calc-data.js');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

module.exports = async (req, res) => {
  if (!CLIENT_ID) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Server not configured: GOOGLE_CLIENT_ID is missing.');
  }

  const token = parseCookies(req).gauth;
  if (!token) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  let email;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: CLIENT_ID });
    const payload = ticket.getPayload();
    email = (payload.email || '').toLowerCase();
    if (!payload.email_verified || !email) {
      res.writeHead(302, { Location: '/?denied=1' });
      return res.end();
    }
  } catch (err) {
    // Token missing/expired/invalid -> back to sign-in.
    res.writeHead(302, { Location: '/?expired=1' });
    return res.end();
  }

  // Check the email against the live Notion authorized-users list.
  // Fail closed: if the list can't be read, deny rather than expose pricing.
  try {
    const allowed = await fetchAllowedEmails();
    if (!allowed.has(email)) {
      // Pass the signed-in email back so the sign-in page can show WHICH
      // account was rejected (the #1 source of confusion: people get signed
      // in as a personal Gmail and can't tell).
      res.writeHead(302, { Location: '/?denied=1&as=' + encodeURIComponent(email) });
      return res.end();
    }
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Authorization list is temporarily unavailable. Please try again shortly.');
  }

  const html = Buffer.from(calcB64, 'base64').toString('utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
};
