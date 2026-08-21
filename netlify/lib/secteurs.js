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

// Logique "feu de circulation" (3 états, pas de seuil intermédiaire) :
//   - 0 candidature acceptée        -> vert  (clignotant), "En attente des premières candidatures"
//   - 1 à QUOTA-1 candidatures      -> jaune (clignotant), "Candidatures en cours — places disponibles"
//   - QUOTA candidatures ou plus    -> rouge (fixe),       "Secteur complet"
// Le vert clignotant signale un secteur encore inactif (pas "beaucoup de place" comme dans une
// ancienne version de cette logique) — c'est le jaune qui couvre tout l'entre-deux, du premier
// candidat accepté jusqu'à la veille du complet, sans jamais révéler combien de places restent.
function evaluerSecteur(count) {
  const restantes = Math.max(0, QUOTA_PAR_SECTEUR - count);
  if (count <= 0) return { couleur: 'vert', message: 'En attente des premières candidatures', restantes };
  if (count < QUOTA_PAR_SECTEUR) return { couleur: 'jaune', message: 'Candidatures en cours — places disponibles', restantes };
  return { couleur: 'rouge', message: 'Secteur complet', restantes };
}

module.exports = {
  SECTEURS_NATIONAUX, QUOTA_PAR_SECTEUR, OBJECTIF_TOTAL, STATUTS_ACCEPTES, evaluerSecteur
};
