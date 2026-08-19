// SALON SOLID 2026 — Primitives PDF partagées entre les documents générés côté serveur (badge :
// netlify/lib/badge-generator.js, attestation : netlify/lib/attestation-generator.js) : palette de
// la charte du site (bleu marine / rouge / blanc), polices et opérateurs de dessin bas niveau
// (clip à coins arrondis, clip circulaire) — pur JS (pdf-lib), aucun binaire natif.
//
// Polices : ce site n'utilise pas de police custom (pile système sans-serif). On embarque donc les
// polices PDF standard (Helvetica / Helvetica-Bold), intégrées nativement à tout lecteur PDF —
// zéro fichier à charger, zéro risque du bug de police variable corrompue rencontré ailleurs
// (fonttools varLib.instancer + pdf-lib subset) puisqu'aucune police custom n'est embarquée.

const {
  rgb, StandardFonts,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath
} = require('pdf-lib');

const NAVY = rgb(0x16 / 255, 0x24 / 255, 0x7d / 255);
const NAVY_DEEP = rgb(0x0a / 255, 0x14 / 255, 0x40 / 255);
const RED = rgb(0xdc / 255, 0x26 / 255, 0x26 / 255);
const WHITE = rgb(1, 1, 1);
const OFFWHITE = rgb(0.961, 0.965, 0.984); // #f5f6fb
const SLATE = rgb(0.545, 0.576, 0.722); // #8b93b8
const INK = rgb(0.102, 0.129, 0.267); // #1a2144

const KAPPA = 0.5522847498307936; // constante standard d'approximation d'un cercle par 4 courbes de Bézier

// IMPORTANT — contourne un bug de pdf-lib 1.17.1 : JpegEmbedder lit `imageData.buffer` (l'
// ArrayBuffer SOUS-JACENT) sans tenir compte de `byteOffset`/`byteLength`. Un Buffer Node issu de
// fs.readFileSync (ou de toute opération de découpe/pool interne à Node) peut être une VUE sur un
// ArrayBuffer partagé plus grand, à un offset non nul — pdf-lib lit alors depuis le début de ce
// buffer partagé et embarque silencieusement les octets d'une AUTRE image (déjà rencontré en test
// local : plusieurs photos traitées dans le même process, la 2e ou 3e héritait des dimensions
// d'une précédente). Cette fonction force une copie isolée dans un ArrayBuffer neuf de taille
// exacte (byteOffset toujours 0) avant tout appel à embedJpg/embedPng — à utiliser sur CHAQUE
// buffer image transmis à pdf-lib, jamais le Buffer brut directement.
function isolateImageBytes(buffer) {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}

async function embedThemeFonts(pdfDoc) {
  const [helvetica, helveticaBold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold)
  ]);
  return { helvetica, helveticaBold };
}

function tracked(text, spaces = 1) {
  return text.split('').join(' '.repeat(spaces));
}

function popClip(page) {
  page.pushOperators(popGraphicsState());
}

function pushClipRoundedRect(page, x, y, w, h, r) {
  const k = r * KAPPA;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
    clip(),
    endPath()
  );
}

function pushClipCircle(page, cx, cy, r) {
  const k = r * KAPPA;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx - r, cy),
    appendBezierCurve(cx - r, cy + k, cx - k, cy + r, cx, cy + r),
    appendBezierCurve(cx + k, cy + r, cx + r, cy + k, cx + r, cy),
    appendBezierCurve(cx + r, cy - k, cx + k, cy - r, cx, cy - r),
    appendBezierCurve(cx - k, cy - r, cx - r, cy - k, cx - r, cy),
    closePath(),
    clip(),
    endPath()
  );
}

function drawRoundedRect(page, x, y, w, h, r, color) {
  pushClipRoundedRect(page, x, y, w, h, r);
  page.drawRectangle({ x, y, width: w, height: h, color });
  popClip(page);
}

// Photo "cover fit" (remplit le cadre sans déformation, recadrée si le ratio diffère) à
// l'intérieur d'un cercle — fonctionne quels que soient le format et le cadrage de la photo.
function drawCoverImageCircle(page, image, cx, cy, r) {
  const size = r * 2;
  const scale = Math.max(size / image.width, size / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = cx - drawW / 2;
  const drawY = cy - drawH / 2;
  pushClipCircle(page, cx, cy, r);
  page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
  popClip(page);
}

function wrapParagraph(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawParagraph(page, text, { font, size, y, lineHeight, color, maxWidth, x, align }) {
  const lines = wrapParagraph(text, font, size, maxWidth);
  let cursor = y;
  lines.forEach((line) => {
    let lineX = x;
    if (align === 'center') {
      const w = font.widthOfTextAtSize(line, size);
      lineX = x + (maxWidth - w) / 2;
    }
    page.drawText(line, { x: lineX, y: cursor, size, font, color });
    cursor -= lineHeight;
  });
  return cursor;
}

module.exports = {
  NAVY, NAVY_DEEP, RED, WHITE, OFFWHITE, SLATE, INK,
  embedThemeFonts, tracked, isolateImageBytes,
  popClip, pushClipRoundedRect, pushClipCircle, drawRoundedRect, drawCoverImageCircle,
  wrapParagraph, drawParagraph
};
