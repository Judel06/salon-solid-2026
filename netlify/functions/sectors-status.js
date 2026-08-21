// SALON SOLID 2026 — Suivi PUBLIC des candidatures "Organisations Exposantes" par secteur.
// Confidentialité : ne renvoie JAMAIS de chiffre exact par secteur (ni compte accepté, ni places
// restantes, ni noms d'organisations) — uniquement une couleur + un message d'incitation par
// secteur, plus le total global confirmé (affiché comme compteur dynamique, jamais figé à 0).
// Pour les chiffres exacts par secteur : voir admin-sectors-status.js (protégé, session admin).

const { getAdminClient } = require('../lib/supabase-admin');
const { SECTEURS_NATIONAUX, OBJECTIF_TOTAL, STATUTS_ACCEPTES, evaluerSecteur } = require('../lib/secteurs');

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Configuration Supabase manquante côté serveur.' }) };
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('accreditations')
    .select('secteur_national')
    .eq('category', 'exposant')
    .in('status', STATUTS_ACCEPTES);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const counts = {};
  SECTEURS_NATIONAUX.forEach((s) => { counts[s] = 0; });
  (data || []).forEach((row) => { if (counts[row.secteur_national] !== undefined) counts[row.secteur_national] += 1; });

  const secteurs = SECTEURS_NATIONAUX.map((nom) => {
    const { couleur, message } = evaluerSecteur(counts[nom]);
    return { secteur: nom, couleur, message };
  });

  const totalConfirme = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    body: JSON.stringify({ ok: true, secteurs, totalConfirme, objectifTotal: OBJECTIF_TOTAL })
  };
};
