// SALON SOLID 2026 — Traitement en lot "Générer badge + attestation" : reprend les candidatures
// dont le statut est "Approuvé" mais qui n'ont pas encore de documents générés (generated_at IS
// NULL — normalement le statut passe automatiquement à "Accrédité" dès l'approbation ; un reliquat
// "Approuvé" sans documents signale un échec de génération antérieur, ou des candidatures
// approuvées avant la mise en place de cette fonctionnalité).
//
// Traite un LOT LIMITÉ par appel (BATCH_SIZE) plutôt que tout d'un coup : chaque candidature
// implique plusieurs allers-retours réseau (matricule, téléchargement photo, 2 PDF, 2 envois vers
// le stockage, mise à jour, e-mail) — au-delà d'une poignée de candidatures, un traitement
// entièrement séquentiel dans une seule invocation risquerait de dépasser le délai d'exécution
// d'une fonction Netlify synchrone. Le tableau de bord (admin.js) rappelle cette fonction en boucle
// jusqu'à ce que `remaining` atteigne 0, ce qui permet de traiter un volume important (ex. 500
// candidatures) de façon fiable, par petits paquets.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { finalizeAccreditation } = require('../lib/accreditation-completion');

const BATCH_SIZE = 8;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Méthode non autorisée' }) };
  }

  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
  }

  const admin = getAdminClient();

  const { count: totalPending, error: countError } = await admin
    .from('accreditations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Approuvé')
    .is('generated_at', null);

  if (countError) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const { data: batch, error } = await admin
    .from('accreditations')
    .select('*')
    .eq('status', 'Approuvé')
    .is('generated_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const results = [];
  for (const accreditation of batch || []) {
    const result = await finalizeAccreditation(accreditation);
    results.push({ id: accreditation.id, nom_complet: accreditation.nom_complet, ...result });
  }

  const succeeded = results.filter((r) => r.ok).length;
  const remaining = Math.max(0, (totalPending || 0) - (batch || []).length);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, processed: results.length, succeeded, remaining, results })
  };
};
