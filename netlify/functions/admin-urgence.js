// SALON SOLID 2026 — Lecture/écriture de la configuration du mode "Dernière ligne droite" depuis
// le tableau de bord /admin (protégé par session). GET : config actuelle + état calculé (actif ou
// non, avec le total confirmé exact — ici la confidentialité ne s'applique pas, c'est l'espace
// interne). POST : met à jour mode/date/seuils (fusion partielle, voir ecrireConfig).

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { STATUTS_ACCEPTES, OBJECTIF_TOTAL } = require('../lib/secteurs');
const { lireConfig, ecrireConfig, evaluerUrgence } = require('../lib/urgence');

const MODES_VALIDES = ['auto', 'force_on', 'force_off'];

async function totalConfirme() {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from('accreditations')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'exposant')
    .in('status', STATUTS_ACCEPTES);
  if (error) throw error;
  return count || 0;
}

exports.handler = async (event) => {
  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Requête invalide.' }) };
    }

    const patch = {};
    if (body.mode !== undefined) {
      if (!MODES_VALIDES.includes(body.mode)) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Mode invalide.' }) };
      }
      patch.mode = body.mode;
    }
    if (body.dateLimiteInscription !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dateLimiteInscription)) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Date invalide (format AAAA-MM-JJ).' }) };
      }
      patch.dateLimiteInscription = body.dateLimiteInscription;
    }
    if (body.joursAvantDeclenchement !== undefined) {
      const n = Number(body.joursAvantDeclenchement);
      if (!Number.isInteger(n) || n < 0 || n > 120) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Nombre de jours invalide.' }) };
      }
      patch.joursAvantDeclenchement = n;
    }
    if (body.seuilPourcentage !== undefined) {
      const n = Number(body.seuilPourcentage);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Seuil invalide (0-100).' }) };
      }
      patch.seuilPourcentage = n;
    }

    try {
      const nouvelleConfig = await ecrireConfig(patch);
      const total = await totalConfirme();
      const etat = evaluerUrgence(nouvelleConfig, total, OBJECTIF_TOTAL);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, config: nouvelleConfig, etat, totalConfirme: total, objectifTotal: OBJECTIF_TOTAL }) };
    } catch (err) {
      console.error('admin-urgence POST: échec', err);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Échec de l'enregistrement." }) };
    }
  }

  try {
    const config = await lireConfig();
    const total = await totalConfirme();
    const etat = evaluerUrgence(config, total, OBJECTIF_TOTAL);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, config, etat, totalConfirme: total, objectifTotal: OBJECTIF_TOTAL }) };
  } catch (err) {
    console.error('admin-urgence GET: échec', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }
};
