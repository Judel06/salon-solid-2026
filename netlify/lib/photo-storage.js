// SALON SOLID 2026 — Photos de profil des candidats, stockées dans le bucket Supabase Storage
// privé `accreditation-photos` (jamais public, accès uniquement via la clé service role côté
// serveur). Le badge (netlify/lib/badge-generator.js) télécharge la photo depuis ce même bucket
// au moment de la génération.

const { getAdminClient } = require('./supabase-admin');

const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // marge au-delà des 5 Mo annoncés côté client (photo déjà redimensionnée en JPEG avant envoi)

// Décode un data URL ("data:image/jpeg;base64,...") envoyé par le formulaire (photo déjà
// redimensionnée côté client, voir le script de resize dans accreditation.html) en { buffer, mime }.
function decodeBase64Photo(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png));base64,([a-zA-Z0-9+/=]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null;
  return { buffer, mime: match[1].toLowerCase() };
}

async function uploadPhoto(objectPath, buffer, mime) {
  const admin = getAdminClient();
  const { error } = await admin.storage.from('accreditation-photos').upload(objectPath, buffer, {
    contentType: mime,
    upsert: true
  });
  if (error) throw new Error('Échec du téléversement de la photo : ' + error.message);
  return objectPath;
}

async function downloadPhoto(objectPath) {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from('accreditation-photos').download(objectPath);
  if (error) throw new Error('Échec de récupération de la photo : ' + error.message);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function mimeFromPath(objectPath) {
  return /\.png$/i.test(objectPath || '') ? 'image/png' : 'image/jpeg';
}

module.exports = { decodeBase64Photo, uploadPhoto, downloadPhoto, mimeFromPath };
