// SALON SOLID 2026 — Système de suivi des candidatures "Organisations Exposantes" par secteur de
// la vie nationale haïtienne. Liste figée après validation : toute modification ici doit rester
// cohérente avec les options du formulaire (accreditation.html, onglet Organisation Exposante) et
// avec les lignes déjà enregistrées en base (colonne accreditations.secteur_national).
//
// Base de 8 organisations par secteur (quota), 25 secteurs -> 200 organisations exposantes visées.

const SECTEURS_NATIONAUX = [
  'Santé',
  'Éducation et formation',
  'Agriculture et sécurité alimentaire',
  'Environnement et développement durable',
  'Technologie et innovation numérique',
  'Diaspora haïtienne',
  'Tourisme et hôtellerie',
  'Culture, arts et patrimoine',
  'Sécurité et protection civile',
  'Jeunesse et leadership',
  'Entrepreneuriat et PME',
  'Femmes et égalité de genre',
  'Eau, assainissement et hygiène (WASH)',
  'Énergie et infrastructures',
  'Droits humains et justice',
  'Gouvernance et administration publique',
  'Microfinance et inclusion financière',
  'Commerce et industrie',
  'Urbanisme et logement',
  'Transport et logistique',
  'Médias et communication',
  'Sport',
  'Religion et confessions de foi',
  'Handicap et inclusion sociale',
  'Coopération internationale et bailleurs de fonds'
];

const QUOTA_PAR_SECTEUR = 8;
const OBJECTIF_TOTAL = SECTEURS_NATIONAUX.length * QUOTA_PAR_SECTEUR; // 200

// Statuts comptant comme "candidature acceptée" pour le quota d'un secteur (voir
// accreditation-completion.js : "Approuvé" bascule sur "Accrédité" dans la même requête, les deux
// représentent une acceptation confirmée par le comité).
const STATUTS_ACCEPTES = ['Approuvé', 'Accrédité'];

// Seuils (places RESTANTES sur 8, pas le nombre accepté) déclenchant chaque couleur côté public —
// valeurs par défaut, ajustables ici sans toucher au reste du système :
//   - 0 place restante         -> rouge, "Secteur complet"
//   - 1 place restante         -> rouge, "Dernières places"
//   - 2 à 3 places restantes   -> jaune, "Places limitées, dépêchez-vous"
//   - 4 places restantes ou +  -> vert,  "Candidatures ouvertes"
const SEUIL_ROUGE_PLACES_RESTANTES = 1;
const SEUIL_JAUNE_PLACES_RESTANTES = 3;

// Évalue un secteur à partir du nombre de candidatures acceptées : couleur + message public ne
// révélant jamais le chiffre exact, plus le compte de places restantes (usage interne/admin
// uniquement — ne jamais renvoyer `restantes` ni `count` dans une réponse publique, voir
// netlify/functions/sectors-status.js vs admin-sectors-status.js).
function evaluerSecteur(count) {
  const restantes = Math.max(0, QUOTA_PAR_SECTEUR - count);
  if (restantes === 0) return { couleur: 'rouge', message: 'Secteur complet', restantes };
  if (restantes <= SEUIL_ROUGE_PLACES_RESTANTES) return { couleur: 'rouge', message: 'Dernières places', restantes };
  if (restantes <= SEUIL_JAUNE_PLACES_RESTANTES) return { couleur: 'jaune', message: 'Places limitées, dépêchez-vous', restantes };
  return { couleur: 'vert', message: 'Candidatures ouvertes', restantes };
}

module.exports = {
  SECTEURS_NATIONAUX, QUOTA_PAR_SECTEUR, OBJECTIF_TOTAL, STATUTS_ACCEPTES,
  SEUIL_ROUGE_PLACES_RESTANTES, SEUIL_JAUNE_PLACES_RESTANTES, evaluerSecteur
};
