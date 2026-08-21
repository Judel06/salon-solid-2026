// SALON SOLID 2026 — Suivi public des candidatures "Organisations Exposantes" par secteur de la
// vie nationale (25 secteurs x 8 organisations = 200 visées). Lecture seule, aucune donnée
// sensible exposée (uniquement le nom des organisations déjà acceptées, jamais email/téléphone) —
// utilisé par organisations.html (section publique) et par le tableau de bord /admin.

const { getAdminClient } = require('../lib/supabase-admin');
const { SECTEURS_NATIONAUX, QUOTA_PAR_SECTEUR, OBJECTIF_TOTAL, STATUTS_ACCEPTES, couleurSecteur } = require('../lib/secteurs');

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Configuration Supabase manquante côté serveur.' }) };
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('accreditations')
    .select('secteur_national, data, status')
    .eq('category', 'exposant')
    .in('status', STATUTS_ACCEPTES);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const bySecteur = {};
  SECTEURS_NATIONAUX.forEach((s) => { bySecteur[s] = []; });
  (data || []).forEach((row) => {
    if (!bySecteur[row.secteur_national]) return; // secteur inconnu/orphelin, ignoré du suivi
    const nom = (row.data && row.data.nom_organisation) ? String(row.data.nom_organisation).trim() : null;
    if (nom) bySecteur[row.secteur_national].push(nom);
  });

  let vert = 0, jaune = 0, rouge = 0, totalConfirme = 0;
  const secteurs = SECTEURS_NATIONAUX.map((nom) => {
    const organisations = bySecteur[nom];
    const count = organisations.length;
    const couleur = couleurSecteur(count);
    if (couleur === 'vert') vert += 1; else if (couleur === 'jaune') jaune += 1; else rouge += 1;
    totalConfirme += count;
    return { secteur: nom, count, quota: QUOTA_PAR_SECTEUR, couleur, organisations };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify({
      ok: true,
      secteurs,
      resume: { vert, jaune, rouge, totalConfirme, objectifTotal: OBJECTIF_TOTAL, nombreSecteurs: SECTEURS_NATIONAUX.length }
    })
  };
};
