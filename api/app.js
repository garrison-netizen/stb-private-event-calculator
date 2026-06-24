// Authenticated gate for the Private Event Pricing Calculator.
// Serves the calculator HTML only after verifying a Google sign-in
// from an allowed company domain. The pricing markup lives in
// calc-data.js (bundled, not publicly served), so nothing is sent
// to the browser until the caller is authenticated.
const { OAuth2Client } = require('google-auth-library');
const calcB64 = require('./calc-data.js');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'spindletap.com').toLowerCase();
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

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: CLIENT_ID });
    const payload = ticket.getPayload();
    const email = (payload.email || '').toLowerCase();
    const domainOk = payload.hd === ALLOWED_DOMAIN || email.endsWith('@' + ALLOWED_DOMAIN);
    if (!payload.email_verified || !domainOk) {
      res.writeHead(302, { Location: '/?denied=1' });
      return res.end();
    }
  } catch (err) {
    // Token missing/expired/invalid -> back to sign-in.
    res.writeHead(302, { Location: '/?expired=1' });
    return res.end();
  }

  const html = Buffer.from(calcB64, 'base64').toString('utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
};
