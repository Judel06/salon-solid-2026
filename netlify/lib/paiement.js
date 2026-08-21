// SALON SOLID 2026 — Paiement en ligne des frais de participation Exposant (Stripe Checkout).
// Portée volontairement limitée à la catégorie "exposant" : c'est la seule dont le tarif est fixe
// et publié (voir tarifs-exposants.html) — les autres catégories (journaliste, partenaire,
// bailleur, organisateur) restent sans paiement en ligne pour l'instant.
//
// Devise : Stripe ne règle pas en gourde haïtienne (HTG) — facturation en USD, montant confirmé
// par l'organisation (184,99 USD, pas une conversion automatique).

const Stripe = require('stripe');

const EXPOSANT_FEE_USD_CENTS = 18499; // 184,99 USD
const EXPOSANT_FEE_LABEL = '184,99 USD';

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY non configurée côté serveur.');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Crée une session Stripe Checkout pour une candidature Exposant approuvée. `siteUrl` doit être
// l'origine publique du site (ex. https://www.salonsolid.com) pour construire les URLs de retour.
async function creerSessionPaiement({ accreditationId, nomOrganisation, email, siteUrl }) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: EXPOSANT_FEE_USD_CENTS,
          product_data: {
            name: 'Frais de participation Exposant — SALON SOLID 2026',
            description: nomOrganisation ? `Organisation : ${nomOrganisation}` : undefined
          }
        },
        quantity: 1
      }
    ],
    metadata: { accreditation_id: accreditationId },
    success_url: `${siteUrl}/paiement-confirme.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/tarifs-exposants.html?paiement=annule`
  });
  return session;
}

module.exports = { getStripeClient, creerSessionPaiement, EXPOSANT_FEE_USD_CENTS, EXPOSANT_FEE_LABEL };
