// SALON SOLID 2026 — Suivi INTERNE (protégé, session admin requise) des candidatures "Organisations
// Exposantes" par secteur : contrairement à sectors-status.js (public), cette fonction renvoie les
// chiffres exacts (candidatures acceptées / 8, places restantes) et les noms des organisations
// déjà acceptées par secteur — réservé au tableau de bord /admin.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { SECTEURS_NATIONAUX, QUOTA_PAR_SECTEUR, OBJECTIF_TOTAL, STATUTS_ACCEPTES, evaluerSecteur } = require('../lib/secteurs');

exports.handler = async (event) => {
  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
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
    if (!bySecteur[row.secteur_national]) return;
    const nom = (row.data && row.data.nom_organisation) ? String(row.data.nom_organisation).trim() : null;
    if (nom) bySecteur[row.secteur_national].push(nom);
  });

  let vert = 0, jaune = 0, rouge = 0, totalConfirme = 0;
  const secteurs = SECTEURS_NATIONAUX.map((nom) => {
    const organisations = bySecteur[nom];
    const count = organisations.length;
    const { couleur, message, restantes } = evaluerSecteur(count);
    if (couleur === 'vert') vert += 1; else if (couleur === 'jaune') jaune += 1; else rouge += 1;
    totalConfirme += count;
    return { secteur: nom, count, quota: QUOTA_PAR_SECTEUR, restantes, couleur, message, organisations };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      ok: true,
      secteurs,
      resume: { vert, jaune, rouge, totalConfirme, objectifTotal: OBJECTIF_TOTAL, nombreSecteurs: SECTEURS_NATIONAUX.length }
    })
  };
};
