import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

const NUC_URL = "https://enuc.nuc.edu.ng/nus";
const seedPath = "supabase/migrations/20261015110000_import_official_nuc_university_directory.sql";
const deltaPath = "supabase/migrations/20261016150000_reconcile_nuc_directory_live_deltas.sql";
const outputDir = "artifacts/nuc-roster-audit";

function decodeHtml(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeState(value) {
  const s = normalizeName(value);
  return s === "fct" || s === "abuja" ? "fct abuja" : s;
}

function splitSqlValues(tuple) {
  const out = [];
  let value = "";
  let inQuote = false;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (ch === "'") {
      if (inQuote && tuple[i + 1] === "'") {
        value += "''";
        i++;
      } else {
        inQuote = !inQuote;
        value += ch;
      }
    } else if (ch === "," && !inQuote) {
      out.push(parseSqlLiteral(value.trim()));
      value = "";
    } else {
      value += ch;
    }
  }
  if (value.trim()) out.push(parseSqlLiteral(value.trim()));
  return out;
}

function parseSqlLiteral(value) {
  if (/^null$/i.test(value)) return null;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseTuples(block) {
  const tuples = [];
  let depth = 0;
  let inQuote = false;
  let tuple = "";
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === "'") {
      if (inQuote && block[i + 1] === "'") {
        if (depth > 0) tuple += "''";
        i++;
        continue;
      }
      inQuote = !inQuote;
      if (depth > 0) tuple += ch;
      continue;
    }
    if (!inQuote && ch === "(") {
      if (depth === 0) tuple = "";
      else tuple += ch;
      depth++;
      continue;
    }
    if (!inQuote && ch === ")") {
      depth--;
      if (depth === 0) tuples.push(splitSqlValues(tuple));
      else if (depth > 0) tuple += ch;
      continue;
    }
    if (depth > 0) tuple += ch;
  }
  return tuples;
}

function readSeedRoster(sql) {
  const bySlug = new Map();
  const updateMatch = sql.match(/from\s*\(\s*values([\s\S]*?)\)\s*as\s+v\s*\(slug\s*,\s*name\s*,\s*ownership\s*,\s*state\s*,\s*official_website\s*\)/i);
  assert.ok(updateMatch, "Could not parse starter-record values from NUC seed migration");
  for (const row of parseTuples(updateMatch[1])) {
    assert.ok(row.length >= 4, "Malformed starter row in seed migration");
    const [slug, name, ownership, state, officialWebsite] = row;
    bySlug.set(slug, { slug, name, ownership, state, officialWebsite, source: "seed" });
  }

  const insertMatch = sql.match(/insert\s+into\s+public\.campus_universities[\s\S]*?\bvalues([\s\S]*?)\bon\s+conflict/i);
  assert.ok(insertMatch, "Could not parse inserted records from NUC seed migration");
  for (const row of parseTuples(insertMatch[1])) {
    assert.ok(row.length >= 7, "Malformed inserted row in seed migration");
    const [name, slug, ownership, state, , officialWebsite] = row;
    bySlug.set(slug, { slug, name, ownership, state, officialWebsite, source: "seed" });
  }
  return bySlug;
}

function applyDelta(roster, sql) {
  const updateMatch = sql.match(/from\s*\(\s*values([\s\S]*?)\)\s*as\s+v\s*\(slug\s*,\s*name\s*,\s*ownership\s*,\s*state\s*\)/i);
  assert.ok(updateMatch, "Could not parse correction values from reconciliation migration");
  let corrections = 0;
  for (const row of parseTuples(updateMatch[1])) {
    const [slug, name, ownership, state] = row;
    const existing = roster.get(slug);
    assert.ok(existing, `Correction slug absent from seed: ${slug}`);
    roster.set(slug, { ...existing, name, ownership, state, source: "seed+delta" });
    corrections++;
  }
  assert.equal(corrections, 16, "Expected 16 ID-preserving correction rows");

  const insertMatch = sql.match(/insert\s+into\s+public\.campus_universities[\s\S]*?\bvalues([\s\S]*?)\bon\s+conflict/i);
  assert.ok(insertMatch, "Could not parse new records from reconciliation migration");
  let additions = 0;
  for (const row of parseTuples(insertMatch[1])) {
    const [name, slug, ownership, state, , officialWebsite] = row;
    const existing = roster.get(slug);
    roster.set(slug, { slug, name, ownership, state, officialWebsite: officialWebsite ?? existing?.officialWebsite ?? null, source: "seed+delta" });
    if (!existing) additions++;
  }
  assert.equal(additions, 1, "Expected one new NUC record in reconciliation migration");
  return { corrections, additions };
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const aa = normalizeName(a);
  const bb = normalizeName(b);
  return 1 - levenshtein(aa, bb) / Math.max(aa.length, bb.length, 1);
}

function parseNucTable(html) {
  const records = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => decodeHtml(cell[1]));
    if (cells.length < 5 || !/^\d+$/.test(cells[0])) continue;
    const [serial, name, year, ownership, state] = cells;
    if (!name || !["Federal", "State", "Private"].includes(ownership)) continue;
    records.push({ serial: Number(serial), name, year: Number(year) || null, ownership, state });
  }
  const byName = new Map();
  for (const row of records) {
    const key = normalizeName(row.name);
    if (!byName.has(key)) byName.set(key, row);
  }
  return [...byName.values()];
}

const response = await fetch(NUC_URL, {
  headers: { "user-agent": "CampusShieldAI-NucRosterAudit/1.0 (+https://github.com/campusshield-ai/campusshield-ai)" }
});
assert.ok(response.ok, `NUC directory fetch failed: HTTP ${response.status}`);
const html = await response.text();
const nuc = parseNucTable(html);
assert.ok(nuc.length >= 300, `Expected a full NUC table, parsed only ${nuc.length} records; page layout may have changed`);

const seed = readFileSync(seedPath, "utf8");
const delta = readFileSync(deltaPath, "utf8");
const roster = readSeedRoster(seed);
const deltaStats = applyDelta(roster, delta);
const database = [...roster.values()];

const nucByName = new Map(nuc.map(row => [normalizeName(row.name), row]));
const matched = [];
const dbUnmatched = [];
for (const db of database) {
  const live = nucByName.get(normalizeName(db.name));
  if (live) {
    matched.push({
      slug: db.slug, databaseName: db.name, nucName: live.name,
      databaseOwnership: db.ownership, nucOwnership: live.ownership,
      databaseState: db.state, nucState: live.state,
      ownershipMismatch: db.ownership !== live.ownership,
      stateMismatch: normalizeState(db.state) !== normalizeState(live.state)
    });
  } else {
    const candidates = nuc.map(row => ({ row, score: similarity(db.name, row.name) }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    dbUnmatched.push({
      slug: db.slug, databaseName: db.name, ownership: db.ownership, state: db.state,
      candidates: candidates.filter(c => c.score >= 0.48).map(c => ({ name: c.row.name, ownership: c.row.ownership, state: c.row.state, similarity: Number(c.score.toFixed(3)) }))
    });
  }
}

const matchedLive = new Set(matched.map(row => normalizeName(row.nucName)));
const nucUnmatched = nuc.filter(row => !matchedLive.has(normalizeName(row.name))).map(row => {
  const candidates = database.map(db => ({ db, score: similarity(row.name, db.name) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  return {
    serial: row.serial, nucName: row.name, ownership: row.ownership, state: row.state,
    candidates: candidates.filter(c => c.score >= 0.48).map(c => ({ name: c.db.name, slug: c.db.slug, ownership: c.db.ownership, state: c.db.state, similarity: Number(c.score.toFixed(3)) }))
  };
});

// Suggest only mutual best matches with a strong name score and identical ownership/state.
 // These are review candidates, not automatic renames; NUC and university sites can conflict.
const nucUnmatchedByName = new Map(nucUnmatched.map(row => [row.nucName, row]));
const suggestedPairs = [];
for (const dbRow of dbUnmatched) {
  const top = dbRow.candidates[0];
  if (!top || top.similarity < 0.72) continue;
  const nucRow = nucUnmatchedByName.get(top.name);
  if (!nucRow || !nucRow.candidates[0]) continue;
  const reverse = nucRow.candidates[0];
  if (
    reverse.name === dbRow.databaseName &&
    reverse.similarity >= 0.72 &&
    dbRow.ownership === nucRow.ownership &&
    normalizeState(dbRow.state) === normalizeState(nucRow.state)
  ) {
    suggestedPairs.push({
      databaseSlug: dbRow.slug,
      databaseName: dbRow.databaseName,
      nucName: nucRow.nucName,
      ownership: dbRow.ownership,
      state: dbRow.state,
      similarity: Number(top.similarity.toFixed(3))
    });
  }
}
suggestedPairs.sort((a, b) => a.databaseName.localeCompare(b.databaseName));
const suggestedDbNames = new Set(suggestedPairs.map(row => row.databaseName));
const suggestedNucNames = new Set(suggestedPairs.map(row => row.nucName));
const unresolvedDatabaseRows = dbUnmatched.filter(row => !suggestedDbNames.has(row.databaseName));
const unresolvedNucRows = nucUnmatched.filter(row => !suggestedNucNames.has(row.nucName));

const duplicateGroups = [];
const normalized = new Map();
for (const row of database) {
  const key = normalizeName(row.name);
  if (!normalized.has(key)) normalized.set(key, []);
  normalized.get(key).push(row);
}
for (const [key, rows] of normalized) if (rows.length > 1) duplicateGroups.push({ normalizedName: key, rows: rows.map(({ slug, name, ownership, state }) => ({ slug, name, ownership, state })) });

const counts = values => values.reduce((acc, row) => ((acc[row.ownership] = (acc[row.ownership] || 0) + 1), acc), {});
const report = {
  generatedAt: new Date().toISOString(),
  sourceUrl: NUC_URL,
  seedMigration: seedPath,
  reconciliationMigration: deltaPath,
  sourceCounts: counts(nuc),
  rosterCounts: counts(database),
  sourceTotal: nuc.length,
  rosterTotal: database.length,
  deltaStats,
  exactNameMatches: matched.length,
  ownershipOrStateMismatches: matched.filter(r => r.ownershipMismatch || r.stateMismatch),
  databaseRowsWithoutExactNameMatch: dbUnmatched,
  nucRowsWithoutExactNameMatch: nucUnmatched,
  suggestedSameInstitutionPairs: suggestedPairs,
  unresolvedDatabaseRows,
  unresolvedNucRows,
  duplicateNormalizedDatabaseNames: duplicateGroups,
  note: "Fuzzy candidates are review suggestions only. Do not automatically delete, merge, deactivate, or regenerate IDs/slugs. The NUC website can contain inconsistent naming; investigate aliases and conflicting NUC pages before changing identity."
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/nuc-roster-audit.json`, JSON.stringify(report, null, 2) + "\n");
const md = [
  "# Live NUC roster audit",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Source: ${NUC_URL}`,
  `- Current NUC table rows parsed: **${report.sourceTotal}**`,
  `- Reconstructed staging roster rows (seed + delta): **${report.rosterTotal}**`,
  `- Exact normalized-name matches: **${report.exactNameMatches}**`,
  `- Matched records with ownership/state mismatches: **${report.ownershipOrStateMismatches.length}**`,
  `- Database names without exact match: **${report.databaseRowsWithoutExactNameMatch.length}**`,
  `- NUC names without exact match: **${report.nucRowsWithoutExactNameMatch.length}**`,
  `- Mutual high-similarity candidate pairs for review: **${report.suggestedSameInstitutionPairs.length}**`,
  `- Database rows still unresolved after candidate pairing: **${report.unresolvedDatabaseRows.length}**`,
  `- NUC rows still unresolved after candidate pairing: **${report.unresolvedNucRows.length}**`,
  `- Duplicate normalized database names: **${report.duplicateNormalizedDatabaseNames.length}**`,
  "",
  "## Counts by ownership",
  "",
  "| Ownership | Live NUC | Reconstructed roster |",
  "|---|---:|---:|",
  ...["Federal", "State", "Private"].map(k => `| ${k} | ${report.sourceCounts[k] || 0} | ${report.rosterCounts[k] || 0} |`),
  "",
  "## Exact-name matches with state/ownership differences",
  "",
  "| Database name | NUC name | DB ownership/state | NUC ownership/state |",
  "|---|---|---|---|",
  ...report.ownershipOrStateMismatches.map(r => `| ${r.databaseName} | ${r.nucName} | ${r.databaseOwnership} / ${r.databaseState} | ${r.nucOwnership} / ${r.nucState} |`),
  "",
  "## High-similarity same-ownership/state candidates (manual review required)",
  "",
  "| Existing database name | Current NUC name | Ownership/state | Name similarity |",
  "|---|---|---|---:|",
  ...report.suggestedSameInstitutionPairs.map(r => `| ${r.databaseName} | ${r.nucName} | ${r.ownership} / ${r.state} | ${r.similarity} |`),
  "",
  "## Database rows without exact normalized-name matches",
  "",
  ...report.databaseRowsWithoutExactNameMatch.map(r => `- **${r.databaseName}** (${r.ownership}, ${r.state}; slug \`${r.slug}\`) — candidates: ${r.candidates.map(c => `${c.name} [${c.similarity}]`).join("; ") || "none"}`),
  "",
  "## NUC rows without exact normalized-name matches",
  "",
  ...report.nucRowsWithoutExactNameMatch.map(r => `- **${r.nucName}** (${r.ownership}, ${r.state}; NUC row ${r.serial}) — candidates: ${r.candidates.map(c => `${c.name} [${c.similarity}]`).join("; ") || "none"}`),
  "",
  "## Review cautions",
  "",
  "- This report compares the live NUC HTML table with the roster reconstructed from the checked-in seed plus the current reconciliation delta. It does not query production.",
  "- Exact name matching is conservative; punctuation and location variants may show up as unmatched even when they refer to the same institution.",
  "- Similarity candidates are hints, not merge decisions.",
  "- No database changes are generated or applied by this script.",
  ""
].join("\n");
writeFileSync(`${outputDir}/nuc-roster-audit.md`, md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.slice(0, 50000));
console.log(JSON.stringify({
  sourceTotal: report.sourceTotal, sourceCounts: report.sourceCounts,
  rosterTotal: report.rosterTotal, rosterCounts: report.rosterCounts,
  exactNameMatches: report.exactNameMatches,
  ownershipOrStateMismatches: report.ownershipOrStateMismatches.length,
  databaseRowsWithoutExactNameMatch: report.databaseRowsWithoutExactNameMatch.length,
  nucRowsWithoutExactNameMatch: report.nucRowsWithoutExactNameMatch.length,
  suggestedSameInstitutionPairs: report.suggestedSameInstitutionPairs.length,
  unresolvedDatabaseRows: report.unresolvedDatabaseRows.length,
  unresolvedNucRows: report.unresolvedNucRows.length,
  duplicateNormalizedDatabaseNames: report.duplicateNormalizedDatabaseNames.length,
  report: `${outputDir}/nuc-roster-audit.md`
}, null, 2));
