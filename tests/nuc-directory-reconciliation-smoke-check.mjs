import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261016150000_reconcile_nuc_directory_live_deltas.sql";
const nameMigrationPath = "supabase/migrations/20261016160000_reconcile_nuc_name_variants.sql";
const stateMigrationPath = "supabase/migrations/20261016170000_reconcile_nuc_state_mismatch.sql";
const baselinePath = "supabase/migrations/20261015110000_import_official_nuc_university_directory.sql";
const migration = readFileSync(migrationPath, "utf8");
const nameMigration = readFileSync(nameMigrationPath, "utf8");
const stateMigration = readFileSync(stateMigrationPath, "utf8");
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
assert.doesNotMatch(stateMigration, /\\bdelete\\s+from\\b/i);
assert.doesNotMatch(stateMigration, /set\\s+id\\s*=|set\\s+slug\\s*=/i);

console.log("NUC directory reconciliation smoke checks passed (16 corrections + 1 addition, then 15 name variants and one confirmed state correction; no ID/slug regeneration or deletion).");
