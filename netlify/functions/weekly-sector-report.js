// SALON SOLID 2026 — Rapport hebdomadaire automatique du suivi "Organisations Exposantes" par
// secteur : liste les secteurs encore vides (rouge) ou partiellement remplis (jaune), pour aider
// l'équipe à prioriser ses relances. Fonction planifiée Netlify (voir netlify.toml, "@weekly") —
// aucun déclenchement manuel n'est nécessaire, mais elle peut aussi être appelée à la main pour
// tester (POST /.netlify/functions/weekly-sector-report).

const { getAdminClient } = require('../lib/supabase-admin');
const { SECTEURS_NATIONAUX, QUOTA_PAR_SECTEUR, OBJECTIF_TOTAL, STATUTS_ACCEPTES, evaluerSecteur } = require('../lib/secteurs');
const nodemailer = require('nodemailer');

const TEAM_NOTIFICATION_EMAILS = ['admin@salonsolid.com', 'salonsolid2030@gmail.com'];

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function computeSectorReport() {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('accreditations')
    .select('secteur_national')
    .eq('category', 'exposant')
    .in('status', STATUTS_ACCEPTES);
  if (error) throw error;

  const counts = {};
  SECTEURS_NATIONAUX.forEach((s) => { counts[s] = 0; });
  (data || []).forEach((row) => { if (counts[row.secteur_national] !== undefined) counts[row.secteur_national] += 1; });

  const secteurs = SECTEURS_NATIONAUX.map((nom) => {
    const { couleur, restantes } = evaluerSecteur(counts[nom]);
    return { secteur: nom, count: counts[nom], restantes, couleur };
  });
  const rouges = secteurs.filter((s) => s.couleur === 'rouge');
  const jaunes = secteurs.filter((s) => s.couleur === 'jaune');
  const verts = secteurs.filter((s) => s.couleur === 'vert');
  const totalConfirme = secteurs.reduce((sum, s) => sum + s.count, 0);

  return { secteurs, rouges, jaunes, verts, totalConfirme };
}

function buildReportHtml(report) {
  const rowsHtml = (list, label) => list.length
    ? list.map((s) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(s.secteur)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.count} / ${QUOTA_PAR_SECTEUR}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:6px 10px;color:#8b93b8;">Aucun secteur ${label}.</td></tr>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <h1 style="color:#0a1440;font-size:19px;">Rapport hebdomadaire — Organisations Exposantes par secteur</h1>
      <p style="color:#3a4166;font-size:13.5px;line-height:1.6;">
        ${report.totalConfirme} / ${OBJECTIF_TOTAL} organisations exposantes confirmées ·
        ${report.verts.length} secteur(s) complet(s) · ${report.jaunes.length} partiel(s) · ${report.rouges.length} vide(s).
      </p>
      <h2 style="color:#dc2626;font-size:14px;margin:20px 0 6px;">Secteurs vides (0/8) — priorité de relance</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${rowsHtml(report.rouges, 'vide')}</table>
      <h2 style="color:#b45309;font-size:14px;margin:20px 0 6px;">Secteurs partiels — à compléter</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${rowsHtml(report.jaunes, 'partiel')}</table>
      <p style="color:#8b93b8;font-size:12px;margin-top:24px;">Tableau de bord complet : <a href="https://www.salonsolid.com/admin" style="color:#16247D;">salonsolid.com/admin</a></p>
    </div>
  `;
}

exports.handler = async () => {
  try {
    const report = await computeSectorReport();

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
      });
      await transporter.sendMail({
        from: `"SALON SOLID 2026" <${process.env.GMAIL_USER}>`,
        to: TEAM_NOTIFICATION_EMAILS,
        subject: `[SALON SOLID 2026] Suivi secteurs — ${report.rouges.length} vide(s), ${report.jaunes.length} partiel(s)`,
        html: buildReportHtml(report)
      });
    } else {
      console.error('weekly-sector-report: GMAIL_USER/GMAIL_APP_PASSWORD non configurés, rapport calculé mais non envoyé');
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, resume: { rouges: report.rouges.length, jaunes: report.jaunes.length, verts: report.verts.length, totalConfirme: report.totalConfirme } }) };
  } catch (err) {
    console.error('weekly-sector-report: échec', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
