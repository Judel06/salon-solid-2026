// SALON SOLID 2026 — Authentification de l'espace /admin : identifiant/mot de passe (ADMIN_USER /
// ADMIN_PASSWORD), session signée (cookie HttpOnly) et blocage temporaire après plusieurs échecs
// de connexion (stocké dans Netlify Blobs, par IP).
//
// IMPORTANT : getStore() doit être appelé avec la forme simple getStore(nomDuStore) — le contexte
// Blobs est injecté automatiquement par le runtime Netlify Functions. La forme
// getStore({ name, siteID, token }) casse toute connexion admin si NETLIFY_SITE_ID/
// NETLIFY_AUTH_TOKEN ne sont pas explicitement configurés (ils ne le sont jamais par défaut).
// Le blocage anti-brute-force est "fail-open" (try/catch) : un incident Netlify Blobs ne doit
// jamais empêcher une connexion légitime, seulement désactiver cette protection secondaire.

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const SESSION_COOKIE = 'solid_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min

function attemptsStore() {
  return getStore('solid-admin-attempts');
}

function clientIp(event) {
  return event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'inconnu';
}

function sign(payload) {
  const secret = process.env.ADMIN_SECRET || '';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function issueSessionCookie(username) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${expires}`;
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function parseCookies(event) {
  const header = event.headers.cookie || event.headers.Cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function verifySession(event) {
  const cookies = parseCookies(event);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return { ok: false, reason: 'Pas de session' };

  const parts = raw.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Session malformée' };
  const [username, expiresStr, sig] = parts;
  const expected = sign(`${username}.${expiresStr}`);
  if (sig !== expected) return { ok: false, reason: 'Signature invalide' };
  if (Date.now() > Number(expiresStr)) return { ok: false, reason: 'Session expirée' };

  return { ok: true, username };
}

async function checkRateLimit(event) {
  const ip = clientIp(event);
  try {
    const store = attemptsStore();
    const record = (await store.get(ip, { type: 'json' })) || { count: 0, lockedUntil: 0 };
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      return { blocked: true, retryAt: record.lockedUntil };
    }
    return { blocked: false, ip, record };
  } catch (err) {
    console.error('checkRateLimit: Netlify Blobs indisponible, on laisse passer (fail-open)', err);
    return { blocked: false, ip, record: { count: 0, lockedUntil: 0 } };
  }
}

async function registerFailedAttempt(ip, record) {
  try {
    const store = attemptsStore();
    const count = (record.count || 0) + 1;
    const next = { count, lockedUntil: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 };
    await store.setJSON(ip, next);
    return next;
  } catch (err) {
    console.error('registerFailedAttempt: Netlify Blobs indisponible', err);
    return { count: (record.count || 0) + 1, lockedUntil: 0 };
  }
}

async function clearAttempts(ip) {
  try {
    const store = attemptsStore();
    await store.delete(ip);
  } catch (err) {
    console.error('clearAttempts: Netlify Blobs indisponible', err);
  }
}

module.exports = {
  issueSessionCookie,
  clearSessionCookie,
  verifySession,
  checkRateLimit,
  registerFailedAttempt,
  clearAttempts,
  clientIp
};
