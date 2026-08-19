// SALON SOLID 2026 — Bouton "Renvoyer les documents" d'une fiche candidat : régénère le badge et
// l'attestation (le matricule déjà attribué est conservé, jamais réémis) et renvoie le courriel
// avec les deux documents en pièces jointes. Utile en cas d'erreur d'adresse email corrigée, de
// document perdu par le destinataire, etc.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { finalizeAccreditation } = require('../lib/accreditation-completion');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Méthode non autorisée' }) };
  }

  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Requête invalide.' }) };
  }

  if (!data.id) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'id manquant.' }) };
  }

  const admin = getAdminClient();
  const { data: accreditation, error } = await admin.from('accreditations').select('*').eq('id', data.id).single();

  if (error || !accreditation) {
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Candidature introuvable.' }) };
  }

  const result = await finalizeAccreditation(accreditation);

  return {
    statusCode: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: result.ok, generation: result })
  };
};
