const { clearSessionCookie } = require('../lib/admin-auth');

exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
  body: JSON.stringify({ ok: true })
});
