// SALON SOLID 2026 — Connexion à l'espace /admin. Vérifie ADMIN_USER/ADMIN_PASSWORD, bloque
// temporairement une IP après plusieurs échecs, et pose un cookie de session signé.

const { issueSessionCookie, checkRateLimit, registerFailedAttempt, clearAttempts } = require('../lib/admin-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Méthode non autorisée' }) };
  }

  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'ADMIN_USER / ADMIN_PASSWORD / ADMIN_SECRET non configurés' }) };
  }

  const rate = await checkRateLimit(event);
  if (rate.blocked) {
    const retrySeconds = Math.ceil((rate.retryAt - Date.now()) / 1000);
    return {
      statusCode: 429,
      body: JSON.stringify({ ok: false, error: `Trop de tentatives. Réessayez dans ${Math.ceil(retrySeconds / 60)} minute(s).` })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) };
  }

  const username = (data.username || '').trim().toLowerCase();
  const password = (data.password || '').trim();
  const valid = username === (process.env.ADMIN_USER || '').trim().toLowerCase()
    && password === (process.env.ADMIN_PASSWORD || '').trim();

  if (!valid) {
    const next = await registerFailedAttempt(rate.ip, rate.record);
    const remaining = Math.max(0, 5 - next.count);
    return {
      statusCode: 401,
      body: JSON.stringify({
        ok: false,
        error: remaining > 0 ? `Identifiants incorrects. ${remaining} essai(s) restant(s).` : 'Trop de tentatives, compte temporairement bloqué.'
      })
    };
  }

  await clearAttempts(rate.ip);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': issueSessionCookie(username) },
    body: JSON.stringify({ ok: true })
  };
};
