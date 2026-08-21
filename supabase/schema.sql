-- SALON SOLID 2026 — schema du parcours candidature -> approbation -> badge -> attestation.
-- A executer dans le SQL Editor du projet Supabase dedie a salonsolid.com.
--
-- Une seule table `accreditations` couvre les 5 categories de candidature (exposant, journaliste,
-- partenaire, bailleur, organisateur) : les champs communs (nom, email, telephone, photo, statut,
-- matricule, chemins des documents) sont des colonnes ; tous les champs specifiques a chaque
-- formulaire (secteur d'activite, type de media, niveau de sponsoring, etc.) sont stockes dans la
-- colonne `data` (jsonb) telle que soumise par le formulaire correspondant.

create table if not exists public.accreditations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category text not null check (category in ('exposant', 'journaliste', 'partenaire', 'bailleur', 'organisateur')),
  status text not null default 'En attente d''approbation' check (status in ('En attente d''approbation', 'Approuvé', 'Refusé', 'Accrédité')),
  nom_complet text not null,
  civilite text not null default 'M.' check (civilite in ('M.', 'Mme')), -- accord automatique "accrédité"/"accréditée" sur l'attestation
  email text,
  telephone text,
  role_label text not null, -- ex. "Exposant", "Journaliste — Radio Test", "Partenaire Institutionnel" : utilise dans le corps de l'attestation
  photo_path text,
  data jsonb not null default '{}',
  matricule text,
  badge_path text,
  attestation_path text,
  generated_at timestamptz
);

create index if not exists accreditations_status_idx on public.accreditations (status);
create index if not exists accreditations_category_idx on public.accreditations (category);
create index if not exists accreditations_created_at_idx on public.accreditations (created_at desc);

alter table public.accreditations enable row level security;
-- RLS activee, aucune policy : inaccessible en anon/authenticated (navigateur). Seule la cle
-- service_role (cote serveur uniquement, contourne RLS) peut lire/ecrire.

-- GRANT explicite sur la table : Supabase n'accorde pas automatiquement les privileges de base a
-- service_role sur une table creee via le SQL Editor (RLS et privileges de base sont deux choses
-- distinctes en Postgres) — sans cette ligne, un insert echoue avec "permission denied" meme si
-- RLS est correctement configuree.
grant all on table public.accreditations to service_role;

-- Matricule sequentiel, format SOLID<annee><numero> (ex. SOLID2026454544), demarre a 454544 sur
-- demande. Une sequence Postgres garantit l'unicite meme en cas d'approbations concurrentes.
create sequence if not exists public.accreditation_matricule_seq start with 454544;

create or replace function public.next_accreditation_matricule()
returns text
language sql
as $$
  select 'SOLID' || to_char(now(), 'YYYY') || lpad(nextval('public.accreditation_matricule_seq')::text, 6, '0');
$$;

-- Une fonction `language sql` simple (pas `security definer`) s'execute avec les droits de
-- l'appelant : l'EXECUTE sur la fonction seule ne suffit pas, service_role a aussi besoin d'un
-- GRANT direct sur la sequence pour que nextval() fonctionne a l'interieur de la fonction.
grant execute on function public.next_accreditation_matricule() to service_role;
grant usage, select on sequence public.accreditation_matricule_seq to service_role;

-- Necessaire apres toute migration de schema pour que PostgREST (l'API Supabase) prenne en compte
-- les nouvelles tables/fonctions/colonnes sans attendre son propre cycle de rafraichissement.
notify pgrst, 'reload schema';

-- ============================================================================================
-- MIGRATION — ajout de `civilite` (accord automatique "accrédité"/"accréditée" sur l'attestation)
-- A executer une seule fois dans le SQL Editor Supabase si la table `accreditations` existe deja
-- (le `create table if not exists` ci-dessus n'ajoute pas de colonne a une table existante).
-- ============================================================================================
alter table public.accreditations
  add column if not exists civilite text not null default 'M.' check (civilite in ('M.', 'Mme'));

notify pgrst, 'reload schema';

-- ============================================================================================
-- MIGRATION — suivi des candidatures "Organisations Exposantes" par secteur de la vie nationale
-- (25 secteurs x 8 organisations = 200 visees, voir netlify/lib/secteurs.js pour la liste figee).
-- Ajoute `secteur_national` (rempli uniquement pour category = 'exposant') et le statut
-- "Liste d'attente" (candidature auto-mise en attente si le secteur choisi est deja a 8/8 au
-- moment de la soumission — voir netlify/functions/accreditation-submit.js).
-- ============================================================================================
alter table public.accreditations
  add column if not exists secteur_national text;

alter table public.accreditations drop constraint if exists accreditations_status_check;
alter table public.accreditations
  add constraint accreditations_status_check
  check (status in ('En attente d''approbation', 'Approuvé', 'Refusé', 'Accrédité', 'Liste d''attente'));

create index if not exists accreditations_secteur_national_idx on public.accreditations (secteur_national);

notify pgrst, 'reload schema';
