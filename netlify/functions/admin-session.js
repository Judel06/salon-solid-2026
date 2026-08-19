// SALON SOLID 2026 — Vérifie si la session /admin en cours est valide (utilisé au chargement du dashboard).

const { verifySession } = require('../lib/admin-auth');

exports.handler = async (event) => {
  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false }) };
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, username: session.username }) };
};
