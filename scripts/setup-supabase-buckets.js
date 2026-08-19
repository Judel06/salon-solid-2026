// SALON SOLID 2026 — Script à exécuter UNE SEULE FOIS après avoir créé le projet Supabase et
// exécuté supabase/schema.sql, pour créer les 3 buckets de stockage privés nécessaires.
//
// Un `insert into storage.buckets (...)` en SQL brut n'est PAS reconnu par l'API Storage de
// Supabase — les buckets doivent être créés via admin.storage.createBucket(), d'où ce script.
//
// Utilisation :
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/setup-supabase-buckets.js

const { createClient } = require('@supabase/supabase-js');

const BUCKETS = ['accreditation-photos', 'accreditation-badges', 'accreditation-attestations'];

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans l\'environnement.');
    process.exit(1);
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  for (const bucket of BUCKETS) {
    const { data, error } = await admin.storage.createBucket(bucket, { public: false });
    if (error) {
      if (/already exists/i.test(error.message)) {
        console.log(`✓ ${bucket} existe déjà`);
      } else {
        console.error(`✗ ${bucket} — échec :`, error.message);
      }
    } else {
      console.log(`✓ ${bucket} créé`);
    }
  }
}

main();
