// SALON SOLID 2026 — Génère l'Attestation de Participation officielle (PDF, format paysage), une
// fois une candidature approuvée. Style "certificat" crème/or : double bordure fine dorée à coins
// ornés, filigrane léger du logo ADIS-HAÏTI en fond de page, logo + nom de l'organisation en
// en-tête, titre, corps de texte avec champs dynamiques (nom et rôle en gras), sceau doré
// SALON SOLID 2026, référence unique du document, date d'émission, zone signature.
//
// Accord grammatical automatique : le champ `civilite` ('M.' ou 'Mme', collecté sur les 5
// formulaires d'accréditation) détermine "accrédité" (masculin, sans e) ou "accréditée" (féminin,
// avec e) — jamais de "(e)" entre parenthèses.

const { PDFDocument, rgb } = require('pdf-lib');
const {
  GOLD, GOLD_LIGHT, CREAM, CERT_INK,
  embedThemeFonts, isolateImageBytes
} = require('./pdf-kit');

const CERT_SLATE = rgb(0.435, 0.396, 0.322); // gris chaud (pendant du SLATE bleuté, pour fond crème/or

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

// "M." -> masculin ("accrédité", sans e muet) ; "Mme" -> féminin ("accréditée", avec e). Par
// défaut (civilité absente/inconnue) : accord masculin, jamais de "(e)" ambigu.
function participleAccredite(civilite) {
  return String(civilite || '').trim() === 'Mme' ? 'accréditée' : 'accrédité';
}

// Découpe une liste de segments {text, font, size, color} en lignes qui tiennent dans maxWidth,
// en respectant la police/taille propre à chaque segment (permet le gras au milieu d'une phrase).
function wrapRichParagraph(segments, maxWidth) {
  const tokens = [];
  segments.forEach((seg) => {
    seg.text.split(/(\s+)/).forEach((tok) => {
      if (tok === '') return;
      tokens.push({ text: tok, font: seg.font, size: seg.size, color: seg.color });
    });
  });

  const lines = [];
  let current = [];
  let currentWidth = 0;

  const trimTrailingSpace = (line) => {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
    return line;
  };

  tokens.forEach((tok) => {
    const tokWidth = tok.font.widthOfTextAtSize(tok.text, tok.size);
    const isSpace = /^\s+$/.test(tok.text);
    if (currentWidth + tokWidth > maxWidth && current.length && !isSpace) {
      lines.push(trimTrailingSpace(current));
      current = [tok];
      currentWidth = tokWidth;
    } else {
      current.push(tok);
      currentWidth += tokWidth;
    }
  });
  if (current.length) lines.push(trimTrailingSpace(current));
  return lines;
}

function drawRichParagraph(page, segments, { y, lineHeight, maxWidth }) {
  const lines = wrapRichParagraph(segments, maxWidth);
  let cursor = y;
  lines.forEach((line) => {
    const lineWidth = line.reduce((sum, w) => sum + w.font.widthOfTextAtSize(w.text, w.size), 0);
    let x = (PAGE_W - lineWidth) / 2;
    line.forEach((w) => {
      page.drawText(w.text, { x, y: cursor, size: w.size, font: w.font, color: w.color });
      x += w.font.widthOfTextAtSize(w.text, w.size);
    });
    cursor -= lineHeight;
  });
  return cursor;
}

// Petit point décoratif utilisé aux angles de la bordure, dans l'ornement du titre et dans le sceau.
function drawDiamond(page, cx, cy, r, color) {
  page.drawEllipse({ x: cx, y: cy, xScale: r, yScale: r, color });
}

// Sceau doré "SALON SOLID 2026" : anneaux concentriques + texte empilé + points décoratifs, en
// remplacement d'un blason importé (pur vecteur, cohérent avec le reste du document).
function drawSeal(page, { cx, cy, timesBold, timesRoman }) {
  const outerR = 46;
  page.drawEllipse({ x: cx, y: cy, xScale: outerR, yScale: outerR, borderColor: GOLD, borderWidth: 1.4 });
  page.drawEllipse({ x: cx, y: cy, xScale: outerR - 5, yScale: outerR - 5, borderColor: GOLD_LIGHT, borderWidth: 0.6 });
  page.drawEllipse({ x: cx, y: cy, xScale: outerR - 12, yScale: outerR - 12, color: GOLD });

  drawDiamond(page, cx, cy + 20, 2.6, CREAM);
  const salonW = timesBold.widthOfTextAtSize('SALON', 9.5);
  page.drawText('SALON', { x: cx - salonW / 2, y: cy + 8, size: 9.5, font: timesBold, color: CREAM });
  const solidW = timesBold.widthOfTextAtSize('SOLID', 13);
  page.drawText('SOLID', { x: cx - solidW / 2, y: cy - 6, size: 13, font: timesBold, color: CREAM });
  const yearW = timesRoman.widthOfTextAtSize('2026', 9.5);
  page.drawText('2026', { x: cx - yearW / 2, y: cy - 20, size: 9.5, font: timesRoman, color: CREAM });
  drawDiamond(page, cx, cy - 30, 2.6, CREAM);
}

async function generateAttestationPdf({ fullName, roleLabel, civilite, matricule, issueDate, logoPngBuffer, signataireNom, signataireTitre }) {
  const pdfDoc = await PDFDocument.create();
  const { timesRoman, timesBold, timesItalic } = await embedThemeFonts(pdfDoc);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CREAM });

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
    const wmSize = 300;
    const ratio = logoImage.height / logoImage.width;
    page.drawImage(logoImage, {
      x: (PAGE_W - wmSize) / 2,
      y: (PAGE_H - wmSize * ratio) / 2,
      width: wmSize,
      height: wmSize * ratio,
      opacity: 0.05
    });
  }

  // Double bordure dorée + petits losanges d'angle (accent "certificat officiel").
  page.drawRectangle({ x: BORDER_INSET, y: BORDER_INSET, width: PAGE_W - BORDER_INSET * 2, height: PAGE_H - BORDER_INSET * 2, borderColor: GOLD, borderWidth: 1.6 });
  page.drawRectangle({ x: BORDER_INSET + 6, y: BORDER_INSET + 6, width: PAGE_W - (BORDER_INSET + 6) * 2, height: PAGE_H - (BORDER_INSET + 6) * 2, borderColor: GOLD_LIGHT, borderWidth: 0.6 });
  [
    [BORDER_INSET, BORDER_INSET], [PAGE_W - BORDER_INSET, BORDER_INSET],
    [BORDER_INSET, PAGE_H - BORDER_INSET], [PAGE_W - BORDER_INSET, PAGE_H - BORDER_INSET]
  ].forEach(([cx, cy]) => drawDiamond(page, cx, cy, 4.5, GOLD));

  // En-tête : logo + nom de l'organisation.
  let headerY = PAGE_H - 66;
  if (logoImage) {
    const logoSize = 54;
    const ratio = logoImage.height / logoImage.width;
    page.drawImage(logoImage, { x: (PAGE_W - logoSize) / 2, y: headerY - logoSize * ratio, width: logoSize, height: logoSize * ratio });
    headerY -= logoSize * ratio + 14;
  }
  centeredText(page, 'ADIS-HAÏTI', { font: timesBold, size: 21, y: headerY, color: GOLD });
  headerY -= 18;
  centeredText(page, 'Action Diplomatique et Sociale — Haïti', { font: timesBold, size: 11, y: headerY, color: CERT_INK });
  headerY -= 15;
  centeredText(page, 'Organisateur du SALON SOLID 2026', { font: timesItalic, size: 10.5, y: headerY, color: GOLD });

  // Titre + petit ornement (filet-losange-filet).
  const titleY = headerY - 40;
  centeredText(page, 'ATTESTATION DE PARTICIPATION', { font: timesBold, size: 27, y: titleY, color: CERT_INK });
  const ornY = titleY - 16;
  page.drawLine({ start: { x: PAGE_W / 2 - 92, y: ornY }, end: { x: PAGE_W / 2 - 12, y: ornY }, thickness: 1, color: GOLD });
  page.drawLine({ start: { x: PAGE_W / 2 + 12, y: ornY }, end: { x: PAGE_W / 2 + 92, y: ornY }, thickness: 1, color: GOLD });
  drawDiamond(page, PAGE_W / 2, ornY, 4, GOLD);

  // Corps du texte, centré, marges généreuses (mise en page paysage). Nom et rôle en gras,
  // accord "accrédité"/"accréditée" déterminé automatiquement par la civilité du candidat.
  const bodyWidth = PAGE_W - MARGIN * 2 - 60;
  const bodySize = 12.5;
  const bodyLineHeight = 21;
  let cursor = ornY - 40;

  const participle = participleAccredite(civilite);
  cursor = drawRichParagraph(page, [
    { text: 'Nous soussignés, ADIS-HAÏTI, certifions que ', font: timesRoman, size: bodySize, color: CERT_INK },
    { text: fullName, font: timesBold, size: bodySize, color: CERT_INK },
    { text: ` a été ${participle} en qualité de `, font: timesRoman, size: bodySize, color: CERT_INK },
    { text: roleLabel, font: timesBold, size: bodySize, color: CERT_INK },
    { text: ' dans le cadre du SALON SOLID 2026 — Salon des Organisations Locales et Internationales au Développement, tenu du 13 au 15 novembre 2026 à Pétion-Ville, Haïti.', font: timesRoman, size: bodySize, color: CERT_INK }
  ], { y: cursor, lineHeight: bodyLineHeight, maxWidth: bodyWidth });
  cursor -= 16;
  centeredText(page, 'Fait pour servir et valoir ce que de droit.', { font: timesBold, size: bodySize, y: cursor, color: CERT_INK });

  // Sceau doré, aligné à gauche.
  drawSeal(page, { cx: MARGIN + 30 + 46, cy: 106, timesBold, timesRoman });

  // Bloc date + signature, aligné à droite.
  const sigW = 240;
  const sigRightX = PAGE_W - MARGIN - 30;
  const sigX = sigRightX - sigW;
  const dateLabel = `Fait à Port-au-Prince, le ${issueDate}.`;
  const dateWidth = timesRoman.widthOfTextAtSize(dateLabel, 10);
  page.drawText(dateLabel, { x: sigRightX - dateWidth, y: 152, size: 10, font: timesRoman, color: CERT_SLATE });

  const signatureName = signataireNom || 'Bernice Néré Charles';
  const sigScriptWidth = timesItalic.widthOfTextAtSize(signatureName, 21);
  page.drawText(signatureName, { x: sigRightX - sigScriptWidth, y: 122, size: 21, font: timesItalic, color: CERT_INK });
  page.drawLine({ start: { x: sigX, y: 112 }, end: { x: sigRightX, y: 112 }, thickness: 0.75, color: GOLD });
  const printedWidth = timesBold.widthOfTextAtSize(signatureName, 12);
  page.drawText(signatureName, { x: sigRightX - printedWidth, y: 96, size: 12, font: timesBold, color: CERT_INK });
  const titleLabel = signataireTitre || 'Directrice du SALON SOLID 2026';
  const titleWidth = timesRoman.widthOfTextAtSize(titleLabel, 9.5);
  page.drawText(titleLabel, { x: sigRightX - titleWidth, y: 81, size: 9.5, font: timesRoman, color: CERT_SLATE });

  // Pied de page : référence du document + coordonnées.
  const attestationRef = toAttestationRef(matricule);
  centeredText(page, `ADIS-HAÏTI · www.salonsolid.com · admin@salonsolid.com · Réf. ${attestationRef}`, { font: timesRoman, size: 8.5, y: 34, color: CERT_SLATE });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateAttestationPdf, toAttestationRef };
