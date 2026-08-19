// SALON SOLID 2026 — client Supabase côté serveur (clé service role, contourne RLS), utilisé
// uniquement par les Netlify Functions de ce site — jamais exposé au navigateur.
// Variables d'environnement requises : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const { createClient } = require('@supabase/supabase-js');

function getAdminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = { getAdminClient };
