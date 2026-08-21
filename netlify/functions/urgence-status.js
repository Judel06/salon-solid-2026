// SALON SOLID 2026 — Statut PUBLIC du mode "Dernière ligne droite". Ne renvoie jamais le nombre
// exact de candidatures ni le pourcentage de remplissage — uniquement : actif ou non, la raison
// générale (date / taux / manuel, utile pour l'affichage mais pas confidentielle), le nombre de
// jours restants avant la date limite (une date publique, pas un chiffre de remplissage), et les
// variantes de texte de bannière.

const { getAdminClient } = require('../lib/supabase-admin');
const { STATUTS_ACCEPTES, OBJECTIF_TOTAL } = require('../lib/secteurs');
const { lireConfig, evaluerUrgence, VARIANTES_BANNIERE } = require('../lib/urgence');

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Configuration Supabase manquante côté serveur.' }) };
  }

  const admin = getAdminClient();
  const { count, error } = await admin
    .from('accreditations')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'exposant')
    .in('status', STATUTS_ACCEPTES);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const config = await lireConfig();
  const { actif, raison, joursRestants } = evaluerUrgence(config, count || 0, OBJECTIF_TOTAL);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    body: JSON.stringify({
      ok: true,
      actif,
      raison,
      joursRestants,
      dateLimiteInscription: config.dateLimiteInscription,
      variantesBanniere: VARIANTES_BANNIERE
    })
  };
};
