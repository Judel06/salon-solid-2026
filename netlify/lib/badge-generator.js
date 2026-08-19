// SALON SOLID 2026 — Génère le badge d'accréditation officiel (PDF, format carte verticale de
// type lanyard), une fois une candidature approuvée. Pur JS (pdf-lib), aucun binaire natif.
//
// Mise en page : carte à coins arrondis (clip vectoriel), encoche de préhension en haut, filigrane
// "carte du monde" en pointillés discrets dans l'en-tête bleu marine, photo recadrée en cercle
// (liseré rouge, cover-fit — fonctionne quel que soit le format/cadrage de la photo source), bande
// claire dédiée au matricule, pied de page sur bande rouge (organisation + site web).
// Couleurs/typo reprises de la charte du site (bleu marine #16247D / rouge #DC2626), polices PDF
// standard (Helvetica) — voir netlify/lib/pdf-kit.js.

const { PDFDocument, rgb } = require('pdf-lib');
const {
  NAVY, NAVY_DEEP, RED, WHITE, OFFWHITE,
  embedThemeFonts, tracked, isolateImageBytes,
  popClip, pushClipRoundedRect, pushClipCircle, drawRoundedRect, drawCoverImageCircle
} = require('./pdf-kit');

const CARD_W = 340;
const CARD_H = 560;
const CORNER_R = 22;

const RED_BAND_H = 54;
const MATRICULE_BAND_H = 84;
const MATRICULE_BAND_Y = RED_BAND_H;

function centeredText(page, text, { font, size, y, color }) {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (CARD_W - textWidth) / 2, y, size, font, color });
}

// Filigrane "carte du monde" très discret dans l'en-tête : grille de points de densité irrégulière
// (silhouettes de masses continentales approximées par zones de plus forte densité) plutôt qu'un
// tracé géographique exact. Bruit pseudo-aléatoire déterministe (même rendu à chaque génération).
function drawWorldMapWatermark(page, x, y, w, h) {
  const dotColor = rgb(1, 1, 1);
  const cols = 34;
  const rows = 20;
  const spacingX = w / cols;
  const spacingY = h / rows;
  const landBands = [
    { rowMin: 2, rowMax: 6, colMin: 3, colMax: 12 },
    { rowMin: 3, rowMax: 9, colMin: 14, colMax: 19 },
    { rowMin: 7, rowMax: 15, colMin: 2, colMax: 9 },
    { rowMin: 4, rowMax: 8, colMin: 21, colMax: 31 },
    { rowMin: 10, rowMax: 16, colMin: 22, colMax: 30 },
    { rowMin: 12, rowMax: 17, colMin: 5, colMax: 11 }
  ];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const inLand = landBands.some((b) => row >= b.rowMin && row <= b.rowMax && col >= b.colMin && col <= b.colMax);
      const noise = Math.abs(Math.sin(row * 12.9898 + col * 78.233) * 43758.5453) % 1;
      const keep = inLand ? noise > 0.35 : noise > 0.88;
      if (!keep) continue;
      const px = x + col * spacingX + spacingX / 2;
      const py = y + row * spacingY + spacingY / 2;
      page.drawEllipse({ x: px, y: py, xScale: 0.55, yScale: 0.55, color: dotColor, opacity: inLand ? 0.075 : 0.05 });
    }
  }
}

async function generateBadgePdf({ fullName, roleLabel, matricule, photoBuffer, photoMime }) {
  const pdfDoc = await PDFDocument.create();
  const { helvetica, helveticaBold } = await embedThemeFonts(pdfDoc);

  const isolatedPhoto = isolateImageBytes(photoBuffer);
  const photoImage = /png/i.test(photoMime || '')
    ? await pdfDoc.embedPng(isolatedPhoto)
    : await pdfDoc.embedJpg(isolatedPhoto);

  const page = pdfDoc.addPage([CARD_W, CARD_H]);

  // Tout le contenu est dessiné à l'intérieur d'un clip à coins arrondis.
  pushClipRoundedRect(page, 0, 0, CARD_W, CARD_H, CORNER_R);

  // ---- Bande rouge (pied de page) ----
  page.drawRectangle({ x: 0, y: 0, width: CARD_W, height: RED_BAND_H, color: RED });
  centeredText(page, 'SALON SOLID 2026 — ADIS-HAÏTI', { font: helveticaBold, size: 8, y: 32, color: WHITE });
  centeredText(page, 'www.salonsolid.com', { font: helvetica, size: 8, y: 20, color: WHITE });

  // ---- Bande claire (matricule) ----
  page.drawRectangle({ x: 0, y: MATRICULE_BAND_Y, width: CARD_W, height: MATRICULE_BAND_H, color: OFFWHITE });
  centeredText(page, matricule, { font: helveticaBold, size: 22, y: MATRICULE_BAND_Y + 46, color: NAVY });
  centeredText(page, tracked('NUMÉRO MATRICULE', 1), { font: helvetica, size: 8.5, y: MATRICULE_BAND_Y + 28, color: rgb(0.42, 0.46, 0.52) });

  // ---- Zone marine (en-tête + photo + identité) ----
  const navyY = MATRICULE_BAND_Y + MATRICULE_BAND_H;
  const navyH = CARD_H - navyY;
  page.drawRectangle({ x: 0, y: navyY, width: CARD_W, height: navyH, color: NAVY });
  page.drawRectangle({ x: 0, y: CARD_H - 118, width: CARD_W, height: 118, color: NAVY_DEEP });
  drawWorldMapWatermark(page, 0, CARD_H - 220, CARD_W, 220);

  // Encoche de préhension (style lanyard).
  const holeW = 92;
  const holeH = 16;
  drawRoundedRect(page, (CARD_W - holeW) / 2, CARD_H - 34, holeW, holeH, holeH / 2, WHITE);

  // Titre.
  centeredText(page, 'SALON SOLID 2026', { font: helveticaBold, size: 24, y: CARD_H - 90, color: WHITE });
  centeredText(page, tracked('ACCRÉDITATION OFFICIELLE', 1), { font: helveticaBold, size: 8.5, y: CARD_H - 110, color: RED });
  page.drawLine({ start: { x: CARD_W / 2 - 60, y: CARD_H - 120 }, end: { x: CARD_W / 2 + 60, y: CARD_H - 120 }, thickness: 0.75, color: RED });

  // Photo de profil, cadre circulaire à liseré rouge, recadrage "cover fit" automatique.
  const photoR = 92;
  const photoCx = CARD_W / 2;
  const photoCy = CARD_H - 120 - 26 - photoR;
  const ringR = photoR + 5;
  pushClipCircle(page, photoCx, photoCy, ringR);
  page.drawRectangle({ x: photoCx - ringR, y: photoCy - ringR, width: ringR * 2, height: ringR * 2, color: RED });
  popClip(page);
  drawCoverImageCircle(page, photoImage, photoCx, photoCy, photoR);

  // Identité du membre.
  const nameY = photoCy - photoR - 44;
  centeredText(page, String(fullName).trim().toUpperCase(), { font: helveticaBold, size: 20, y: nameY, color: WHITE });
  page.drawLine({ start: { x: CARD_W / 2 - 44, y: nameY - 16 }, end: { x: CARD_W / 2 + 44, y: nameY - 16 }, thickness: 0.75, color: RED });
  centeredText(page, tracked(String(roleLabel || '').toUpperCase(), 1), { font: helveticaBold, size: 11.5, y: nameY - 34, color: RED });

  popClip(page); // referme le clip global à coins arrondis posé en tout début de fonction

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateBadgePdf };
