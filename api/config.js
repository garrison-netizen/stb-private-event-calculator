// Exposes only the public Google client ID to the sign-in page.
// The client ID is not a secret; the verification still happens
// server-side in app.js.
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ clientId: process.env.GOOGLE_CLIENT_ID || '' }));
};
