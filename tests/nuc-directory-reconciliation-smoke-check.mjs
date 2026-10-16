import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261016150000_reconcile_nuc_directory_live_deltas.sql";
const nameMigrationPath = "supabase/migrations/20261016160000_reconcile_nuc_name_variants.sql";
const stateMigrationPath = "supabase/migrations/20261016170000_reconcile_nuc_state_mismatch.sql";
const deactivationMigrationPath = "supabase/migrations/20261016180000_deactivate_duplicate_mewar_alias.sql";
const manualMigrationPath = "supabase/migrations/20261016190000_reconcile_nuc_manual_name_matches.sql";
const sokotoMigrationPath = "supabase/migrations/20261016200000_reconcile_sokoto_state_university_name.sql";
const officialNamesMigrationPath = "supabase/migrations/20261016210000_correct_official_current_university_names.sql";
const officialNamesMigrationPath = "supabase/migrations/20261016210000_correct_official_current_university_names.sql";
const baselinePath = "supabase/migrations/20261015110000_import_official_nuc_university_directory.sql";
const migration = readFileSync(migrationPath, "utf8");
const nameMigration = readFileSync(nameMigrationPath, "utf8");
const stateMigration = readFileSync(stateMigrationPath, "utf8");
const deactivationMigration = readFileSync(deactivationMigrationPath, "utf8");
const manualMigration = readFileSync(manualMigrationPath, "utf8");
const sokotoMigration = readFileSync(sokotoMigrationPath, "utf8");
const officialNamesMigration = readFileSync(officialNamesMigrationPath, "utf8");
const officialNamesMigration = readFileSync(officialNamesMigrationPath, "utf8");
const baseline = readFileSync(baselinePath, "utf8");

const expectedSlugs = [
  "federal-university-gashua-yobe",
  "federal-university-dutsin-ma-katsina",
  "federal-university-otuoke-bayelsa",
  "federal-university-gusau-zamfara",
  "jigawa-state-university-of-medical-and-allied-health-sciences-majia",
  "city-university-abuja",
  "millenium-crest-university-ikare-akoko-ondo-state",
  "transatlantic-university-of-medine-and-health-sciences-umuchukwu-anambra-state",
  "baba-ahmed-university-kano-state",
  "modibbo-adama-university",
  "michael-okpara-university",
  "federal-university-of-health-sciences-katsina",
  "federal-university-of-agriculture-and-developmental-studies-iragbuji-osun-state",
  "federal-university-of-agriculture-and-technology-okeho-oyo-state",
  "cross-river-university-of-education-and-entrepeneurship-akampa-cross-river-state",
  "university-of-aeronautics-and-aerospace-engineering-ezza-ebonyi-state",
];

assert.match(migration, /https:\/\/enuc\.nuc\.edu\.ng\/nus/);
assert.match(migration, /expected_count integer := 16/);
assert.match(migration, /begin;/i);
assert.match(migration, /commit;/i);
assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
assert.doesNotMatch(migration, /set\s+id\s*=|set\s+slug\s*=/i);

for (const slug of expectedSlugs) {
  assert.ok(baseline.includes(slug), `reconciliation target slug must already exist: ${slug}`);
  assert.ok(migration.includes(slug), `reconciliation must include target slug: ${slug}`);
}

assert.match(migration, /'federal-university-gashua-yobe', 'Federal University, Gashua, Yobe', 'Federal', 'Yobe'/);
assert.match(migration, /'jigawa-state-university-of-medical-and-allied-health-sciences-majia'.*'Jigawa'/);
assert.match(migration, /'federal-university-of-health-sciences-katsina', 'Federal University of Health Sciences, Funtua, Katsina State'/);
assert.match(migration, /Mewar University, Masaka, Nasarawa State/);
assert.match(migration, /on conflict \(slug\) do update/i);


const expectedNameSlugs = [
  "abdulsalam-abubakar-university-of-agriculture-and-climate-action-mokwa-niger-state",
  "arthur-javis-university-akpoyubo-cross-river-state",
  "british-canadian-university-obufu-cross-river-state",
  "federal-university-of-agriculture-bassam-biri-bayelsa",
  "gerar-university-of-medical-science-imope-ijebu-ogun-state",
  "huda-university-gusau-zamafara-state",
  "hillside-university-of-science-and-technology-okemisi-ekiti-state",
  "lighthouse-university-evbobanosa-edo-state",
  "tonine-iredia-university-of-communication-benin-city-edo-state",
  "umar-musa-yar-adua-university-katsina",
  "west-midlands-open-university-ibadan-oyo-state",
  "nigerian-maritime-university-okerenkoko-delta-state",
  "alex-ekwueme-university-ndufu-alike-ebonyi-state",
  "state-university-of-medical-and-applied-sciences-igbo-eno-enugu",
  "eko-university-of-medical-and-health-sciences-ijanikin-lagos",
];
assert.match(nameMigration, /expected_count integer := 15/);
assert.match(nameMigration, /begin;/i);
assert.match(nameMigration, /commit;/i);
assert.doesNotMatch(nameMigration, /\bdelete\s+from\b/i);
assert.doesNotMatch(nameMigration, /set\s+id\s*=|set\s+slug\s*=/i);
for (const slug of expectedNameSlugs) {
  assert.ok(baseline.includes(slug), `name-correction target slug must exist in baseline: ${slug}`);
  assert.ok(nameMigration.includes(slug), `name-correction migration must include slug: ${slug}`);
}
assert.match(nameMigration, /Arthur Jarvis University, Akpabuyo, Cross River State/);
assert.match(nameMigration, /Nigeria Maritime University Okerenkoko, Delta State/);

assert.match(stateMigration, /Mercy Medical University, Iwara, Iwo, Osun State/);
assert.match(stateMigration, /state = 'Osun'/);
assert.match(stateMigration, /mercy-medical-university-iwo-ogun-state/);
assert.doesNotMatch(stateMigration, /\bdelete\s+from\b/i);
assert.doesNotMatch(stateMigration, /set\s+id\s*=|set\s+slug\s*=/i);

assert.match(deactivationMigration, /mewar-international-university-masaka-nasarawa-state/);
assert.match(deactivationMigration, /set is_active = false/i);
assert.match(deactivationMigration, /Mewar University alias candidate is referenced/);
assert.doesNotMatch(deactivationMigration, /\bdelete\s+from\b/i);
assert.doesNotMatch(deactivationMigration, /set\s+id\s*=|set\s+slug\s*=/i);


const expectedManualNameSlugs = [
  "ekiti-state-university",
  "pan-atlantic-university",
  "bayelsa-medical-university",
  "crescent-university",
  "baze-university",
  "glorious-vision-university-ogwa-edo-state",
  "evangel-university-akaeze",
  "augustine-university",
  "chrisland-university",
  "micheal-cecilia-ibru-university",
  "mountain-top-university",
  "ojaja-university-eiyenkorin-kwara-state",
  "precious-cornerstone-university-oyo",
  "skyline-university-kano",
  "khalifa-isiyaku-rabiu-university-kano",
  "rayhaan-university-kebbi",
  "wesley-university-ondo",
];
assert.match(manualMigration, /expected_count integer := 17/);
assert.match(manualMigration, /begin;/i);
assert.match(manualMigration, /commit;/i);
assert.doesNotMatch(manualMigration, /\\bdelete\\s+from\\b/i);
assert.doesNotMatch(manualMigration, /set\\s+id\\s*=|set\\s+slug\\s*=/i);
for (const slug of expectedManualNameSlugs) {
  assert.ok(baseline.includes(slug), `manual name target slug must exist in baseline: ${slug}`);
  assert.ok(manualMigration.includes(slug), `manual name migration must include slug: ${slug}`);
}
assert.match(manualMigration, /Michael & Cecilia Ibru University, Owhode, Delta State/);
assert.match(manualMigration, /Glorious Vision University \(formerly Samuel Adegboyega University\)/);

assert.match(sokotoMigration, /Sokoto State University, Sokoto/);
assert.match(sokotoMigration, /sokoto-state-university/);
assert.doesNotMatch(sokotoMigration, /\\bdelete\\s+from\\b/i);
assert.doesNotMatch(sokotoMigration, /set\\s+id\\s*=|set\\s+slug\\s*=/i);

assert.match(officialNamesMigration, /Kashim Ibrahim University, Maiduguri, Borno State/);
assert.match(officialNamesMigration, /Elrazi Medical University, Kano/);
assert.match(officialNamesMigration, /kashim-ibrahim-formerly-bornu-state-university-maiduguri/);
assert.match(officialNamesMigration, /elrazi-medical-university-yargaya-university-kano-state/);
assert.doesNotMatch(officialNamesMigration, /\\bdelete\\s+from\\b/i);
assert.doesNotMatch(officialNamesMigration, /set\\s+id\\s*=|set\\s+slug\\s*=/i);

console.log("NUC directory reconciliation smoke checks passed (16 corrections + 1 addition, 15 name variants, one state correction, and one guarded duplicate-alias deactivation, and 17 manual name matches plus one exact Sokoto name correction and two official-name corrections; IDs/slugs preserved).");
