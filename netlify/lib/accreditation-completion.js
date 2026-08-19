// SALON SOLID 2026 — Étape commune déclenchée dès qu'une candidature passe au statut "Approuvé"
// (voir admin-update-status.js), en traitement en lot pour les candidatures déjà approuvées avant
// la mise en place de cette fonctionnalité (voir admin-bulk-generate.js), ou pour réémettre les
// documents à la demande (voir admin-resend-documents.js) : attribue le numéro matricule
// séquentiel (next_accreditation_matricule(), voir supabase/schema.sql — jamais réattribué si déjà
// présent), génère le badge PDF (si une photo est disponible) et l'attestation PDF, les enregistre
// dans les buckets privés dédiés, met à jour la candidature (matricule, chemins, statut
// "Accrédité") et envoie le courriel avec les deux documents en pièces jointes.
//
// Best-effort sur la génération/l'envoi : une erreur ici est loggée et renvoyée à l'appelant sous
// forme de résultat structuré plutôt que de lever une exception qui interromprait un traitement en
// lot portant sur plusieurs candidatures.

const fs = require('fs');
const path = require('path');
const { getAdminClient } = require('./supabase-admin');
const { downloadPhoto, mimeFromPath } = require('./photo-storage');
const { generateBadgePdf } = require('./badge-generator');
const { generateAttestationPdf, toAttestationRef } = require('./attestation-generator');
const { sendAccreditationApprovedEmail } = require('./accreditation-email');

const LOGO_PATH = path.join(__dirname, 'assets', 'adis-haiti-logo.png');

function formatDate(date) {
  try {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (err) {
    return date.toISOString().slice(0, 10);
  }
}

function readLogoBuffer() {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch (err) {
    console.error('accreditation-completion: logo introuvable, attestation générée sans filigrane/en-tête', err);
    return null;
  }
}

async function finalizeAccreditation(accreditation) {
  const admin = getAdminClient();
  const result = { ok: true, matricule: accreditation.matricule || null, badgeGenerated: false, attestationGenerated: false, emailSent: false, error: null };

  let matricule = accreditation.matricule;
  if (!matricule) {
    const { data, error } = await admin.rpc('next_accreditation_matricule');
    if (error) {
      console.error('finalizeAccreditation: échec next_accreditation_matricule()', error);
      result.ok = false;
      result.error = 'Échec attribution du matricule : ' + error.message;
      return result;
    }
    matricule = data;
  }
  result.matricule = matricule;

  let badgeBuffer = null;
  let badgePath = null;
  if (accreditation.photo_path) {
    try {
      const photoBuffer = await downloadPhoto(accreditation.photo_path);
      badgeBuffer = await generateBadgePdf({
        fullName: accreditation.nom_complet,
        roleLabel: accreditation.role_label,
        matricule,
        photoBuffer,
        photoMime: mimeFromPath(accreditation.photo_path)
      });
      badgePath = `${matricule}.pdf`;
      const { error: uploadError } = await admin.storage.from('accreditation-badges').upload(badgePath, badgeBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });
      if (uploadError) throw uploadError;
      result.badgeGenerated = true;
    } catch (err) {
      console.error('finalizeAccreditation: échec génération/upload badge', err);
      badgeBuffer = null;
      badgePath = null;
    }
  } else {
    console.error('finalizeAccreditation: aucune photo disponible, badge non généré', accreditation.id);
  }

  let attestationBuffer = null;
  let attestationPath = null;
  try {
    attestationBuffer = await generateAttestationPdf({
      fullName: accreditation.nom_complet,
      roleLabel: accreditation.role_label,
      matricule,
      issueDate: formatDate(new Date()),
      logoPngBuffer: readLogoBuffer()
    });
    attestationPath = `${toAttestationRef(matricule)}.pdf`;
    const { error: uploadError } = await admin.storage.from('accreditation-attestations').upload(attestationPath, attestationBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (uploadError) throw uploadError;
    result.attestationGenerated = true;
  } catch (err) {
    console.error('finalizeAccreditation: échec génération/upload attestation', err);
    attestationBuffer = null;
    attestationPath = null;
  }

  const update = { matricule, generated_at: new Date().toISOString(), status: 'Accrédité' };
  if (badgePath) update.badge_path = badgePath;
  if (attestationPath) update.attestation_path = attestationPath;

  const { error: updateError } = await admin.from('accreditations').update(update).eq('id', accreditation.id);
  if (updateError) {
    console.error('finalizeAccreditation: échec mise à jour de la candidature', updateError);
    result.ok = false;
    result.error = 'Documents générés mais échec de mise à jour de la candidature : ' + updateError.message;
  }

  try {
    await sendAccreditationApprovedEmail(accreditation, badgeBuffer, attestationBuffer);
    result.emailSent = true;
  } catch (err) {
    console.error('finalizeAccreditation: échec envoi courriel', err);
    result.error = result.error ? result.error + ' | Échec envoi courriel : ' + err.message : 'Échec envoi courriel : ' + err.message;
  }

  return result;
}

module.exports = { finalizeAccreditation };
