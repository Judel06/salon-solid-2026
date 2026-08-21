// SALON SOLID 2026 — Courriels automatiques du parcours de candidature : notification à l'équipe
// à la soumission, accusé de réception au candidat, et courriel d'approbation avec badge +
// attestation en pièces jointes. Compte Gmail (nodemailer + mot de passe d'application — pas le
// mot de passe normal du compte, Google bloque l'auth SMTP directe autrement).
//
// Un échec d'envoi ne doit jamais faire échouer la soumission/l'action admin elle-même : les
// appelants englobent ces appels dans un try/catch et se contentent de logger l'erreur.

const nodemailer = require('nodemailer');

const TEAM_NOTIFICATION_EMAILS = ['admin@salonsolid.com', 'salonsolid2030@gmail.com'];

const CATEGORY_LABELS = {
  exposant: 'Organisation Exposante',
  journaliste: 'Journaliste / Média',
  partenaire: 'Partenaire',
  bailleur: 'Bailleur / Sponsor Officiel',
  organisateur: 'Organisateur / Logistique / Sécurité'
};

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrap(title, bodyHtml) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#16247D;color:#ffffff;border-radius:14px;overflow:hidden;">
      <div style="padding:32px 36px 6px;text-align:center;">
        <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#dbe1f7;margin:0 0 10px;">SALON SOLID 2026</p>
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 18px;">${title}</h1>
      </div>
      <div style="background:#ffffff;color:#1a2144;padding:28px 36px 32px;">
        ${bodyHtml}
        <p style="line-height:1.6;color:#8b93b8;font-size:12.5px;margin:18px 0 0;">Une question ? Écrivez-nous à <a href="mailto:admin@salonsolid.com" style="color:#16247D;">admin@salonsolid.com</a>.</p>
      </div>
    </div>
  `;
}

async function sendMail({ to, subject, html, attachments }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD non configurés');
  }
  await transporter().sendMail({
    from: `"SALON SOLID 2026" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: attachments || []
  });
}

async function sendAccreditationAdminNotification(accreditation) {
  const categoryLabel = CATEGORY_LABELS[accreditation.category] || accreditation.category;
  const rows = [
    ['Catégorie', escapeHtml(categoryLabel)],
    ['Nom complet', escapeHtml(accreditation.nom_complet)],
    ['Email', escapeHtml(accreditation.email || '—')],
    ['Téléphone', escapeHtml(accreditation.telephone || '—')],
    ['Rôle / fonction', escapeHtml(accreditation.role_label)]
  ];
  const table = rows.map(([k, v]) => `
    <tr><td style="padding:8px 0;color:#8b93b8;vertical-align:top;width:150px;">${k}</td><td style="padding:8px 0;">${v}</td></tr>
  `).join('');

  const html = wrap('Nouvelle demande d\'accréditation', `
    <p style="line-height:1.6;margin:0 0 18px;">Une nouvelle candidature vient d'être soumise sur le site.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">${table}</table>
    <p style="line-height:1.6;margin:0;">Retrouvez le dossier complet dans le <a href="https://www.salonsolid.com/admin" style="color:#16247D;">tableau de bord /admin</a>.</p>
  `);

  await sendMail({
    to: TEAM_NOTIFICATION_EMAILS,
    subject: `[Accréditation ${categoryLabel}] Nouvelle candidature — ${accreditation.nom_complet}`,
    html
  });
}

async function sendAccreditationAcknowledgment(accreditation) {
  const html = wrap('Candidature bien reçue', `
    <p style="line-height:1.6;margin:0 0 16px;">Bonjour ${escapeHtml(accreditation.nom_complet)},</p>
    <p style="line-height:1.6;margin:0 0 18px;">Votre candidature a bien été reçue. Notre comité l'examinera et reviendra vers vous.</p>
    <p style="line-height:1.6;margin:0;">L'équipe SALON SOLID 2026</p>
  `);
  if (accreditation.email) {
    await sendMail({ to: accreditation.email, subject: 'Votre candidature SALON SOLID 2026 a bien été reçue', html });
  }
}

async function sendAccreditationApprovedEmail(accreditation, badgeBuffer, attestationBuffer) {
  const html = wrap('Félicitations, votre candidature a été approuvée', `
    <p style="line-height:1.6;margin:0 0 16px;">Bonjour ${escapeHtml(accreditation.nom_complet)},</p>
    <p style="line-height:1.6;margin:0 0 18px;">Félicitations, votre candidature a été approuvée par notre comité.</p>
    <p style="line-height:1.6;margin:0 0 18px;">Veuillez trouver ci-joint votre badge officiel de membre et votre attestation de participation.</p>
    <p style="line-height:1.6;margin:0 0 18px;">Votre badge d'accréditation vous sera remis lors du retrait au Salon, du 13 au 15 novembre 2026.</p>
    <p style="line-height:1.6;margin:0;">Bienvenue au SALON SOLID 2026.<br/>L'équipe SALON SOLID 2026</p>
  `);

  if (!accreditation.email) {
    throw new Error('Candidature sans adresse e-mail — impossible d\'envoyer les documents');
  }

  const attachments = [];
  if (badgeBuffer) {
    attachments.push({ filename: `badge_${slug(accreditation.nom_complet)}.pdf`, content: badgeBuffer, contentType: 'application/pdf' });
  }
  if (attestationBuffer) {
    attachments.push({ filename: `attestation_${slug(accreditation.nom_complet)}.pdf`, content: attestationBuffer, contentType: 'application/pdf' });
  }

  await sendMail({
    to: accreditation.email,
    subject: 'Votre candidature SALON SOLID 2026 a été approuvée !',
    html,
    attachments
  });
}

async function sendPaymentRequestEmail(accreditation, checkoutUrl, feeLabel) {
  const html = wrap('Votre candidature est approuvée — finalisez votre inscription', `
    <p style="line-height:1.6;margin:0 0 16px;">Bonjour ${escapeHtml(accreditation.nom_complet)},</p>
    <p style="line-height:1.6;margin:0 0 18px;">Félicitations, votre candidature comme organisation exposante a été approuvée par notre comité.</p>
    <p style="line-height:1.6;margin:0 0 18px;">Il ne reste qu'une étape : régler les frais de participation (${escapeHtml(feeLabel)}) pour confirmer votre place. Votre badge officiel et votre attestation de participation vous seront envoyés automatiquement dès le paiement reçu.</p>
    <p style="text-align:center;margin:0 0 18px;"><a href="${checkoutUrl}" style="display:inline-block;background:#16247d;color:#fff;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700;text-decoration:none;">Régler les frais de participation →</a></p>
    <p style="line-height:1.6;margin:0;color:#8b93b8;font-size:12.5px;">Paiement sécurisé par carte bancaire (Stripe).</p>
  `);

  if (!accreditation.email) {
    throw new Error('Candidature sans adresse e-mail — impossible d\'envoyer le lien de paiement');
  }

  await sendMail({
    to: accreditation.email,
    subject: 'Plus qu\'une étape — réglez vos frais de participation SALON SOLID 2026',
    html
  });
}

function slug(str) {
  return String(str || 'candidat')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

module.exports = {
  sendAccreditationAdminNotification,
  sendAccreditationAcknowledgment,
  sendAccreditationApprovedEmail,
  sendPaymentRequestEmail,
  CATEGORY_LABELS
};
