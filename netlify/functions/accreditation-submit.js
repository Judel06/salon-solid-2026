// SALON SOLID 2026 — Réception publique des 5 formulaires d'accréditation (accreditation.html).
// Insère directement dans Supabase via la clé service role (RLS verrouillée sur la table : aucun
// accès public direct). La photo de profil (déjà redimensionnée côté client) sert au badge ; les
// autres pièces jointes (documents, logos, carte de presse...) sont stockées telles quelles pour
// consultation dans le tableau de bord admin. Envoie ensuite (best-effort, n'annule jamais la
// candidature en cas d'échec) une notification à l'équipe et un accusé de réception au candidat.
//
// Variables d'environnement requises : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// GMAIL_USER/GMAIL_APP_PASSWORD pour les courriels (échec non bloquant, seulement loggé).

const crypto = require('crypto');
const { getAdminClient } = require('../lib/supabase-admin');
const { decodeBase64Photo, uploadPhoto } = require('../lib/photo-storage');
const { sendAccreditationAdminNotification, sendAccreditationAcknowledgment, CATEGORY_LABELS } = require('../lib/accreditation-email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DOC_BYTES = 8 * 1024 * 1024;

// Pour chaque catégorie : quels champs texte forment le nom complet / l'email / le téléphone /
// l'intitulé de rôle (utilisé sur le badge et dans le corps de l'attestation), et quel champ
// fichier contient la photo de profil destinée au badge.
const CATEGORY_CONFIG = {
  exposant: {
    photoField: 'photo_personne_ressource',
    getNom: (f) => f.personne_ressource_salon,
    getEmail: (f) => f.courriel,
    getTelephone: (f) => f.telephone_personne_ressource || f.telephone,
    getRole: (f) => `Exposant — ${f.nom_organisation || ''}`.trim()
  },
  journaliste: {
    photoField: 'photo_identite',
    getNom: (f) => f.nom_journaliste,
    getEmail: (f) => f.email,
    getTelephone: (f) => f.telephone,
    getRole: (f) => `${f.fonction || 'Journaliste'} — ${f.nom_media || ''}`.trim()
  },
  partenaire: {
    photoField: 'photo_profil',
    getNom: (f) => f.contact_designe,
    getEmail: (f) => f.email,
    getTelephone: (f) => f.telephone,
    getRole: (f) => `Partenaire${f.type_partenariat ? ' ' + f.type_partenariat : ''} — ${f.nom_organisation || ''}`.trim()
  },
  bailleur: {
    photoField: 'photo_profil',
    getNom: (f) => f.contact_designe,
    getEmail: (f) => f.email,
    getTelephone: (f) => f.telephone,
    getRole: (f) => `Bailleur/Sponsor${f.niveau_sponsoring ? ' ' + f.niveau_sponsoring : ''} — ${f.nom_organisation || ''}`.trim()
  },
  organisateur: {
    photoField: 'photo_identite',
    getNom: (f) => f.nom_complet,
    getEmail: (f) => f.email,
    getTelephone: (f) => f.telephone,
    getRole: (f) => (f.role === 'Autre' ? f.role_autre : f.role) || 'Organisateur'
  }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Méthode non autorisée' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Configuration Supabase manquante côté serveur.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Requête invalide.' }) };
  }

  const category = String(payload.category || '').trim();
  const config = CATEGORY_CONFIG[category];
  if (!config) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Catégorie de candidature invalide.' }) };
  }

  const fields = payload.fields || {};
  const files = payload.files || {};

  const nomComplet = String(config.getNom(fields) || '').trim();
  const email = String(config.getEmail(fields) || '').trim().toLowerCase();
  const telephone = String(config.getTelephone(fields) || '').trim();
  const roleLabel = String(config.getRole(fields) || category).trim();

  if (!nomComplet) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Nom complet manquant.' }) };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Adresse email invalide ou manquante.' }) };
  }

  const photoFile = files[config.photoField];
  const photo = photoFile ? decodeBase64Photo(`data:${photoFile.type};base64,${photoFile.data}`) : null;
  if (!photo) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Photo de profil manquante ou invalide (JPG/PNG, 5 Mo maximum).' }) };
  }

  const candidateId = crypto.randomUUID();
  let photoPath;
  try {
    const ext = photo.mime === 'image/png' ? 'png' : 'jpg';
    photoPath = await uploadPhoto(`${category}/${candidateId}.${ext}`, photo.buffer, photo.mime);
  } catch (err) {
    console.error('accreditation-submit: échec téléversement photo', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Erreur lors de l'enregistrement de la photo. Réessayez." }) };
  }

  // Documents secondaires (logo, carte de presse, notices, etc.) : stockés tels quels dans le
  // même bucket privé que la photo, sous un sous-dossier "documents", chemins conservés dans
  // `data.document_paths` pour consultation depuis le tableau de bord admin.
  const admin = getAdminClient();
  const documentPaths = {};
  for (const [fieldName, file] of Object.entries(files)) {
    if (fieldName === config.photoField || !file || !file.data) continue;
    const buffer = Buffer.from(file.data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_DOC_BYTES) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: `Le fichier "${file.name || fieldName}" dépasse 8 Mo.` }) };
    }
    const safeName = String(file.name || fieldName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const docPath = `${category}/${candidateId}/${fieldName}-${safeName}`;
    const { error: docError } = await admin.storage.from('accreditation-photos').upload(docPath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true
    });
    if (docError) {
      console.error('accreditation-submit: échec téléversement document', fieldName, docError);
      continue; // un document secondaire manquant ne doit pas bloquer toute la candidature
    }
    documentPaths[fieldName] = docPath;
  }

  const row = {
    category,
    nom_complet: nomComplet,
    email,
    telephone: telephone || null,
    role_label: roleLabel || category,
    photo_path: photoPath,
    data: { ...fields, document_paths: documentPaths },
    status: "En attente d'approbation"
  };

  const { data: inserted, error } = await admin.from('accreditations').insert(row).select('id').single();

  if (error) {
    console.error('accreditation-submit insert error:', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Erreur lors de l'enregistrement : " + error.message }) };
  }

  try {
    await Promise.all([
      sendAccreditationAdminNotification(row),
      sendAccreditationAcknowledgment(row)
    ]);
  } catch (err) {
    console.error('accreditation-submit: échec envoi courriel(s)', err);
  }

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, id: inserted.id, categoryLabel: CATEGORY_LABELS[category] })
  };
};
