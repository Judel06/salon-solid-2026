// SALON SOLID 2026 — Reçoit les événements Stripe (paiement des frais de participation Exposant).
// Sur "checkout.session.completed" : marque la candidature payée puis déclenche la génération du
// badge/attestation (finalizeAccreditation, déjà utilisé pour l'approbation des autres catégories)
// et l'envoi des documents par courriel.
//
// Sécurité : la signature Stripe est vérifiée avec le corps BRUT de la requête (jamais le JSON
// re-sérialisé — la vérification échouerait silencieusement sur un octet différent). Idempotent :
// si l'événement est retraité par Stripe (retries), la candidature déjà "Accrédité" n'est pas
// régénérée une seconde fois.

const { getAdminClient } = require('../lib/supabase-admin');
const { getStripeClient } = require('../lib/paiement');
const { finalizeAccreditation } = require('../lib/accreditation-completion');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET non configurée côté serveur');
    return { statusCode: 500, body: 'Configuration manquante.' };
  }

  const stripe = getStripeClient();
  const signature = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe-webhook: signature invalide', err.message);
    return { statusCode: 400, body: `Signature invalide : ${err.message}` };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: stripeEvent.type }) };
  }

  const session = stripeEvent.data.object;
  const accreditationId = session.metadata && session.metadata.accreditation_id;
  if (!accreditationId) {
    console.error('stripe-webhook: session sans accreditation_id en métadonnée', session.id);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'no accreditation_id' }) };
  }

  const admin = getAdminClient();
  const { data: accreditation, error } = await admin
    .from('accreditations')
    .select('*')
    .eq('id', accreditationId)
    .single();

  if (error || !accreditation) {
    console.error('stripe-webhook: candidature introuvable', accreditationId, error);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'accreditation not found' }) };
  }

  // Idempotence : déjà traitée (webhook redélivré par Stripe, ou paiement déjà confirmé).
  if (accreditation.status === 'Accrédité' || accreditation.paid_at) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, alreadyProcessed: true }) };
  }

  const { error: updateError } = await admin
    .from('accreditations')
    .update({ paid_at: new Date().toISOString(), stripe_session_id: session.id })
    .eq('id', accreditationId);

  if (updateError) {
    console.error('stripe-webhook: échec enregistrement du paiement', updateError);
    return { statusCode: 500, body: 'Erreur lors de l\'enregistrement du paiement.' };
  }

  const result = await finalizeAccreditation({ ...accreditation, paid_at: new Date().toISOString() });
  if (!result.ok) {
    console.error('stripe-webhook: paiement enregistré mais finalisation incomplète', accreditationId, result.error);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, finalization: result }) };
};
