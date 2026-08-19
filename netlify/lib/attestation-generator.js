// SALON SOLID 2026 — Génère l'Attestation de Participation officielle (PDF, format paysage), une
// fois une candidature approuvée. Style document officiel : bordure décorative fine bleu marine,
// filigrane léger du logo ADIS-HAÏTI (organisation porteuse du Salon) en fond de page, logo +
// nom de l'organisation en en-tête, titre, corps de texte avec champs dynamiques, référence unique
// du document, date d'émission, zone signature.

const { PDFDocument, rgb } = require('pdf-lib');
const { NAVY, RED, INK, SLATE, embedThemeFonts, drawParagraph, isolateImageBytes } = require('./pdf-kit');

// A4 paysage.
const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 56;
const BORDER_INSET = 20;

function centeredText(page, text, { font, size, y, color }) {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - textWidth) / 2, y, size, font, color });
}

// SOLID2026454544 -> SOLID-ATT-2026454544 (insère -ATT- entre le préfixe alphabétique et le
// reste du matricule, qui n'a lui-même pas de séparateur).
function toAttestationRef(matricule) {
  return String(matricule || '').replace(/^([A-Za-z]+)(\d+)$/, '$1-ATT-$2');
}

async function generateAttestationPdf({ fullName, roleLabel, matricule, issueDate, logoPngBuffer, signataireNom, signataireTitre }) {
  const pdfDoc = await PDFDocument.create();
  const { helvetica, helveticaBold } = await embedThemeFonts(pdfDoc);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });

  let logoImage = null;
  if (logoPngBuffer) {
    try {
      logoImage = await pdfDoc.embedPng(isolateImageBytes(logoPngBuffer));
    } catch (err) {
      console.error('generateAttestationPdf: échec embedPng du logo (filigrane/en-tête ignorés)', err);
    }
  }

  // Filigrane : logo centré en fond de page, très faible opacité.
  if (logoImage) {
    const wmSize = 320;
    const ratio = logoImage.height / logoImage.width;
    page.drawImage(logoImage, {
      x: (PAGE_W - wmSize) / 2,
      y: (PAGE_H - wmSize * ratio) / 2,
      width: wmSize,
      height: wmSize * ratio,
      opacity: 0.05
    });
  }

  // Bordure décorative fine bleu marine.
  page.drawRectangle({
    x: BORDER_INSET, y: BORDER_INSET,
    width: PAGE_W - BORDER_INSET * 2, height: PAGE_H - BORDER_INSET * 2,
    borderColor: NAVY, borderWidth: 1.5
  });
  page.drawRectangle({
    x: BORDER_INSET + 5, y: BORDER_INSET + 5,
    width: PAGE_W - (BORDER_INSET + 5) * 2, height: PAGE_H - (BORDER_INSET + 5) * 2,
    borderColor: RED, borderWidth: 0.75
  });

  // En-tête : logo + nom de l'organisation.
  let headerY = PAGE_H - 74;
  if (logoImage) {
    const logoSize = 50;
    const ratio = logoImage.height / logoImage.width;
    page.drawImage(logoImage, { x: (PAGE_W - logoSize) / 2, y: headerY - logoSize * ratio, width: logoSize, height: logoSize * ratio });
    headerY -= logoSize * ratio + 14;
  }
  centeredText(page, 'ADIS-HAÏTI', { font: helveticaBold, size: 15, y: headerY, color: NAVY });
  headerY -= 16;
  centeredText(page, 'Action Diplomatique et Sociale — Haïti · Organisateur du SALON SOLID 2026', { font: helvetica, size: 9, y: headerY, color: SLATE });

  // Titre.
  const titleY = headerY - 40;
  centeredText(page, 'ATTESTATION DE PARTICIPATION', { font: helveticaBold, size: 26, y: titleY, color: NAVY });
  const titleRuleY = titleY - 14;
  page.drawLine({ start: { x: PAGE_W / 2 - 90, y: titleRuleY }, end: { x: PAGE_W / 2 + 90, y: titleRuleY }, thickness: 1.5, color: RED });

  // Corps du texte, centré, marges généreuses (mise en page paysage).
  const bodyWidth = PAGE_W - MARGIN * 2 - 60;
  const bodyX = MARGIN + 30;
  const bodySize = 12.5;
  const bodyLineHeight = 20;
  let cursor = titleRuleY - 46;

  const paragraph1 = `Nous soussignés, ADIS-HAÏTI, certifions que ${fullName} a été accrédité(e) en qualité de ${roleLabel} dans le cadre du SALON SOLID 2026 — Salon des Organisations Locales et Internationales au Développement, tenu du 13 au 15 novembre 2026 à Pétion-Ville, Haïti.`;
  const paragraph2 = 'Fait pour servir et valoir ce que de droit.';

  cursor = drawParagraph(page, paragraph1, { font: helvetica, size: bodySize, y: cursor, lineHeight: bodyLineHeight, color: INK, maxWidth: bodyWidth, x: bodyX, align: 'center' });
  cursor -= 14;
  cursor = drawParagraph(page, paragraph2, { font: helveticaBold, size: bodySize, y: cursor, lineHeight: bodyLineHeight, color: INK, maxWidth: bodyWidth, x: bodyX, align: 'center' });

  // Référence du document + date d'émission, côte à côte.
  const refY = 128;
  const attestationRef = toAttestationRef(matricule);
  page.drawText(`Référence : ${attestationRef}`, { x: MARGIN + 30, y: refY, size: 10, font: helvetica, color: SLATE });
  const dateLabel = `Fait à Port-au-Prince, le ${issueDate}.`;
  const dateWidth = helvetica.widthOfTextAtSize(dateLabel, 10);
  page.drawText(dateLabel, { x: PAGE_W - MARGIN - 30 - dateWidth, y: refY, size: 10, font: helvetica, color: SLATE });

  // Bloc signature, aligné à droite.
  const sigW = 240;
  const sigX = PAGE_W - MARGIN - 30 - sigW;
  let sigY = 122;
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 1, color: SLATE });
  sigY -= 16;
  page.drawText('Signature', { x: sigX, y: sigY, size: 9.5, font: helvetica, color: SLATE });
  sigY -= 26;
  page.drawText(signataireNom || 'Bernice Néré Charles', { x: sigX, y: sigY, size: 12, font: helveticaBold, color: NAVY });
  sigY -= 15;
  page.drawText(signataireTitre || 'Directrice du SALON SOLID 2026', { x: sigX, y: sigY, size: 9.5, font: helvetica, color: SLATE });

  // Pied de page.
  centeredText(page, 'ADIS-HAÏTI · www.salonsolid.com · admin@salonsolid.com', { font: helvetica, size: 8.5, y: 34, color: SLATE });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateAttestationPdf, toAttestationRef };
