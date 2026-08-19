// SALON SOLID 2026 — Liste (et filtre par statut/catégorie) les candidatures d'accréditation pour
// le dashboard /admin.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');

const VALID_STATUSES = ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité'];
const VALID_CATEGORIES = ['exposant', 'journaliste', 'partenaire', 'bailleur', 'organisateur'];

exports.handler = async (event) => {
  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
  }

  const params = event.queryStringParameters || {};
  const admin = getAdminClient();
  let query = admin.from('accreditations').select('*').order('created_at', { ascending: false });

  if (params.status && VALID_STATUSES.includes(params.status)) {
    query = query.eq('status', params.status);
  }
  if (params.category && VALID_CATEGORIES.includes(params.category)) {
    query = query.eq('category', params.category);
  }

  const { data, error } = await query;
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok: true, accreditations: data })
  };
};
