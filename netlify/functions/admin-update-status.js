// SALON SOLID 2026 — Change le statut d'une candidature.
//
// Catégorie "exposant" : le passage à "Approuvé" NE génère PLUS badge/attestation immédiatement —
// il crée une session de paiement Stripe (184,99 USD, voir netlify/lib/paiement.js), passe le
// statut à "En attente de paiement" et envoie le lien de paiement par courriel. La génération du
// badge/attestation est déclenchée uniquement par la confirmation du paiement (voir
// stripe-webhook.js), jamais à la simple approbation.
//
// Toutes les autres catégories (journaliste, partenaire, bailleur, organisateur) gardent le
// comportement d'origine : passage direct à "Approuvé" -> génération immédiate -> "Accrédité".

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');
const { finalizeAccreditation } = require('../lib/accreditation-completion');
const { creerSessionPaiement, EXPOSANT_FEE_LABEL } = require('../lib/paiement');
const { sendPaymentRequestEmail } = require('../lib/accreditation-email');

const VALID_STATUSES = ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité', "Liste d'attente", 'En attente de paiement'];

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

  if (!data.id || !VALID_STATUSES.includes(data.status)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Paramètres invalides.' }) };
  }

  const admin = getAdminClient();

  if (data.status === 'Approuvé') {
    const { data: current, error: fetchError } = await admin.from('accreditations').select('*').eq('id', data.id).single();
    if (fetchError || !current) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Candidature introuvable.' }) };
    }

    if (current.category === 'exposant') {
      let checkoutUrl;
      try {
        const siteUrl = (process.env.URL || 'https://www.salonsolid.com').replace(/\/$/, '');
        const paymentSession = await creerSessionPaiement({
          accreditationId: current.id,
          nomOrganisation: (current.data && current.data.nom_organisation) || current.role_label,
          email: current.email,
          siteUrl
        });
        checkoutUrl = paymentSession.url;

        const { data: updated, error: updateError } = await admin
          .from('accreditations')
          .update({ status: 'En attente de paiement', stripe_session_id: paymentSession.id })
          .eq('id', data.id)
          .select('*')
          .single();
        if (updateError) throw updateError;

        await sendPaymentRequestEmail(updated, checkoutUrl, EXPOSANT_FEE_LABEL);

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, accreditation: updated, checkoutUrl }) };
      } catch (err) {
        console.error('admin-update-status: échec création session de paiement', err);
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Échec de la création du paiement : " + err.message }) };
      }
    }

    const { data: updated, error } = await admin
      .from('accreditations')
      .update({ status: data.status })
      .eq('id', data.id)
      .select('*')
      .single();
    if (error) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur lors de la mise à jour.' }) };
    }

    const result = await finalizeAccreditation(updated);
    const { data: finalRow } = await admin.from('accreditations').select('*').eq('id', data.id).single();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, accreditation: finalRow || updated, generation: result })
    };
  }

  const { data: updated, error } = await admin
    .from('accreditations')
    .update({ status: data.status })
    .eq('id', data.id)
    .select('*')
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur lors de la mise à jour.' }) };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, accreditation: updated }) };
};
