// SALON SOLID 2026 — Change le statut d'une candidature. Le passage à "Approuvé" déclenche
// IMMÉDIATEMENT et automatiquement (sans étape de paiement intermédiaire) la génération du badge
// et de l'attestation, l'envoi des deux documents par courriel, puis le passage direct au statut
// "Accrédité" — voir netlify/lib/accreditation-completion.js.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { finalizeAccreditation } = require('../lib/accreditation-completion');

const VALID_STATUSES = ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité'];

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

  if (!data.id || !VALID_STATUSES.includes(data.status)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Paramètres invalides.' }) };
  }

  const admin = getAdminClient();
  const { data: updated, error } = await admin
    .from('accreditations')
    .update({ status: data.status })
    .eq('id', data.id)
    .select('*')
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur lors de la mise à jour.' }) };
  }

  if (data.status === 'Approuvé') {
    const result = await finalizeAccreditation(updated);
    const { data: finalRow } = await admin.from('accreditations').select('*').eq('id', data.id).single();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, accreditation: finalRow || updated, generation: result })
    };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, accreditation: updated }) };
};
