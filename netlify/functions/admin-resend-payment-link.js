// SALON SOLID 2026 — Bouton "Renvoyer le lien de paiement" d'une fiche candidat Exposant en
// statut "En attente de paiement" : crée une nouvelle session Stripe Checkout (l'ancienne peut
// avoir expiré) et renvoie le courriel avec le nouveau lien.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { creerSessionPaiement, EXPOSANT_FEE_LABEL } = require('../lib/paiement');
const { sendPaymentRequestEmail } = require('../lib/accreditation-email');

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

  if (accreditation.category !== 'exposant') {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Le paiement en ligne ne s'applique qu'à la catégorie Exposant." }) };
  }

  try {
    const siteUrl = (process.env.URL || 'https://www.salonsolid.com').replace(/\/$/, '');
    const paymentSession = await creerSessionPaiement({
      accreditationId: accreditation.id,
      nomOrganisation: accreditation.nom_complet,
      email: accreditation.email,
      siteUrl
    });

    await admin.from('accreditations').update({ stripe_session_id: paymentSession.id }).eq('id', data.id);
    await sendPaymentRequestEmail(accreditation, paymentSession.url, EXPOSANT_FEE_LABEL);

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, checkoutUrl: paymentSession.url }) };
  } catch (err) {
    console.error('admin-resend-payment-link: échec', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
