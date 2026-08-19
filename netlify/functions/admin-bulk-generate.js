// SALON SOLID 2026 — Traitement en lot "Générer badge + attestation" : reprend toutes les
// candidatures dont le statut est "Approuvé" mais qui n'ont pas encore de documents générés
// (generated_at IS NULL — normalement le statut passe automatiquement à "Accrédité" dès
// l'approbation ; un reliquat "Approuvé" sans documents signale un échec de génération antérieur,
// ou des candidatures approuvées avant la mise en place de cette fonctionnalité). Traite chaque
// candidature séquentiellement et renvoie un résumé — une erreur sur une candidature n'interrompt
// pas le traitement des suivantes.

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

  const admin = getAdminClient();
  const { data: pending, error } = await admin
    .from('accreditations')
    .select('*')
    .eq('status', 'Approuvé')
    .is('generated_at', null);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const results = [];
  for (const accreditation of pending || []) {
    const result = await finalizeAccreditation(accreditation);
    results.push({ id: accreditation.id, nom_complet: accreditation.nom_complet, ...result });
  }

  const succeeded = results.filter((r) => r.ok).length;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, processed: results.length, succeeded, results })
  };
};
