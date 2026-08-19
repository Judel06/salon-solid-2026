// SALON SOLID 2026 — Export CSV des candidatures d'accréditation (optionnellement filtré par
// statut/catégorie), pour le bouton "Exporter CSV" du dashboard /admin.

const { verifySession } = require('../lib/admin-auth');
const { getAdminClient } = require('../lib/supabase-admin');

const VALID_STATUSES = ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité'];
const VALID_CATEGORIES = ['exposant', 'journaliste', 'partenaire', 'bailleur', 'organisateur'];

const COLUMNS = [
  'created_at', 'category', 'status', 'nom_complet', 'email', 'telephone',
  'role_label', 'matricule', 'generated_at'
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

exports.handler = async (event) => {
  const session = verifySession(event);
  if (!session.ok) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Non autorisé' }) };
  }

  const params = event.queryStringParameters || {};
  const admin = getAdminClient();
  let query = admin.from('accreditations').select('*').order('created_at', { ascending: false }).limit(5000);
  if (params.status && VALID_STATUSES.includes(params.status)) {
    query = query.eq('status', params.status);
  }
  if (params.category && VALID_CATEGORIES.includes(params.category)) {
    query = query.eq('category', params.category);
  }

  const { data, error } = await query;
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Erreur de lecture.' }) };
  }

  const lines = [COLUMNS.join(',')];
  data.forEach((row) => {
    lines.push(COLUMNS.map((col) => csvEscape(row[col])).join(','));
  });
  const csv = '﻿' + lines.join('\r\n');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="accreditations-solid-2026-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    },
    body: csv
  };
};
