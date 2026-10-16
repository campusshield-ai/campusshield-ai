import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261016150000_reconcile_nuc_directory_live_deltas.sql";
const baselinePath = "supabase/migrations/20261015110000_import_official_nuc_university_directory.sql";
const migration = readFileSync(migrationPath, "utf8");
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

console.log("NUC directory reconciliation smoke checks passed (16 existing slugs; no ID/slug regeneration or deletion).");
