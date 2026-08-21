// SALON SOLID 2026 — Mode "Dernière ligne droite" : signal global d'urgence mobilisatrice
// (bannière + compte à rebours) affiché sur la section Organisations Exposantes à l'approche de
// la clôture des inscriptions, sans jamais révéler de chiffre confidentiel.
//
// Configuration persistée dans Netlify Blobs (pas de migration Supabase nécessaire pour un simple
// interrupteur/seuils ajustables par l'équipe admin). IMPORTANT : getStore() doit être appelé avec
// la forme simple getStore(nomDuStore) — voir netlify/lib/admin-auth.js pour le détail du piège
// (getStore({name, siteID, token}) casse la connexion si NETLIFY_SITE_ID/NETLIFY_AUTH_TOKEN ne
// sont pas configurés, ce qu'ils ne sont jamais par défaut).

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'solid-urgence-config';
const CONFIG_KEY = 'config';

// Valeurs par défaut, ajustables à tout moment depuis /admin (voir admin-urgence.js) :
//   - mode: 'auto' (déclenchement automatique par date/taux), 'force_on' (toujours actif),
//     'force_off' (toujours inactif) — l'interrupteur manuel prime sur les seuils automatiques.
//   - dateLimiteInscription : clôture des inscriptions (à ajuster — proposée ~2 semaines avant le
//     Salon du 13-15 novembre 2026, à confirmer par l'équipe organisatrice).
//   - joursAvantDeclenchement : nombre de jours avant la date limite à partir duquel le mode
//     s'active automatiquement (proposé : 15).
//   - seuilPourcentage : pourcentage du total visé (200) à partir duquel le mode s'active
//     automatiquement, indépendamment de la date (proposé : 75%).
const DEFAULT_CONFIG = {
  mode: 'auto',
  dateLimiteInscription: '2026-10-30',
  joursAvantDeclenchement: 15,
  seuilPourcentage: 75
};

// 4 variantes de texte (ton positif et mobilisateur, jamais anxiogène) — alternées côté client.
const VARIANTES_BANNIERE = [
  'Dernière ligne droite pour rejoindre le SALON SOLID 2026 !',
  "Les places se referment — c'est le moment de candidater.",
  'Plus que quelques jours pour représenter votre secteur.',
  "L'élan final est lancé — rejoignez les organisations déjà confirmées !"
];

function configStore() {
  return getStore(STORE_NAME);
}

async function lireConfig() {
  try {
    const store = configStore();
    const raw = await store.get(CONFIG_KEY, { type: 'json' });
    return raw ? Object.assign({}, DEFAULT_CONFIG, raw) : Object.assign({}, DEFAULT_CONFIG);
  } catch (err) {
    console.error('urgence: échec lecture config (Netlify Blobs), valeurs par défaut utilisées', err);
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

async function ecrireConfig(partialConfig) {
  const store = configStore();
  const actuel = await lireConfig();
  const nouveau = Object.assign({}, actuel, partialConfig);
  await store.setJSON(CONFIG_KEY, nouveau);
  return nouveau;
}

// Évalue l'état actif/inactif du mode à partir de la config + du total confirmé (jamais le détail
// par secteur — la confidentialité par secteur reste gérée par secteurs.js/evaluerSecteur).
function evaluerUrgence(config, totalConfirme, objectifTotal) {
  let joursRestants = null;
  if (config.dateLimiteInscription) {
    const deadline = new Date(config.dateLimiteInscription + 'T23:59:59');
    if (!isNaN(deadline.getTime())) {
      joursRestants = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    }
  }

  if (config.mode === 'force_on') return { actif: true, raison: 'manuel', joursRestants };
  if (config.mode === 'force_off') return { actif: false, raison: 'manuel', joursRestants };

  const parDate = joursRestants !== null && joursRestants >= 0 && joursRestants <= config.joursAvantDeclenchement;
  const pourcentage = objectifTotal > 0 ? (totalConfirme / objectifTotal) * 100 : 0;
  const parTaux = pourcentage >= config.seuilPourcentage;

  return { actif: parDate || parTaux, raison: parDate ? 'date' : (parTaux ? 'taux' : null), joursRestants };
}

module.exports = { DEFAULT_CONFIG, VARIANTES_BANNIERE, lireConfig, ecrireConfig, evaluerUrgence };
