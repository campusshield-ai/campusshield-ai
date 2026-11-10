import assert from "node:assert/strict";
import {
  buildKnowledgeSearchPhrase,
  describeKnowledgeFreshness,
  extractKnowledgeSearchTerms,
  isOfficialCampusQuestion,
  rankKnowledgeSources,
  scoreKnowledgeSource,
  validateKnowledgeCitations
} from "../supabase/functions/shieldmind-chat/knowledge.mjs";

const terms = extractKnowledgeSearchTerms(
  "What are the official admission requirements and application deadline for 2026?",
  5
);
assert.deepEqual(terms, ["admission", "requirements", "application", "deadline"]);
assert.equal(buildKnowledgeSearchPhrase(terms), "admission requirements application deadline");
assert.equal(extractKnowledgeSearchTerms("What are the fees for 2027?").includes("2027"), false);
assert.equal(isOfficialCampusQuestion("What is the tuition fee for the next semester?"), true);
assert.equal(isOfficialCampusQuestion("Explain binary search with a worked example."), false);
assert.equal(isOfficialCampusQuestion("When does course registration close?"), true);

const now = Date.parse("2026-11-10T00:00:00.000Z");
assert.deepEqual(describeKnowledgeFreshness("2026-11-01T00:00:00.000Z", now), {
  age_days: 9,
  freshness_level: "recent",
  freshness_label: "Recently retrieved"
});
assert.deepEqual(describeKnowledgeFreshness("2026-08-01T00:00:00.000Z", now), {
  age_days: 101,
  freshness_level: "stale",
  freshness_label: "Older source — verify current details"
});
assert.equal(describeKnowledgeFreshness("not-a-date", now).freshness_level, "unknown");

const pages = [
  {
    id: "body-match",
    title: "Student services overview",
    body_text: "Applicants should review the official admission requirements and application deadline.",
    fetched_at: "2026-10-01T00:00:00.000Z"
  },
  {
    id: "title-match",
    title: "Official Admission Requirements and Application Deadline",
    body_text: "Contact the admissions office for additional information.",
    fetched_at: "2026-08-01T00:00:00.000Z"
  },
  {
    id: "unrelated",
    title: "Campus sports activities",
    body_text: "Sports clubs and recreation facilities.",
    fetched_at: "2026-11-09T00:00:00.000Z"
  }
];
assert.ok(scoreKnowledgeSource(pages[1], terms, "admission requirements") >
  scoreKnowledgeSource(pages[0], terms, "admission requirements"),
  "title relevance must outweigh a generic body-only match");
assert.deepEqual(rankKnowledgeSources(pages, terms, "admission requirements", 4, now)
  .map(page => page.id), ["title-match", "body-match"]);
assert.equal(rankKnowledgeSources(pages, ["registrar"], "", 4, now).length, 0);

const citations = validateKnowledgeCitations(
  "The published deadline is 30 November [1]. A second, unsupported claim [7] must not retain a fake source marker.",
  [
    { marker: "[1]", title: "Approved admission page" },
    { marker: "[2]", title: "Approved calendar page" }
  ]
);
assert.equal(citations.answer.includes("[7]"), false);
assert.deepEqual(citations.usedSources.map(source => source.marker), ["[1]"]);
assert.deepEqual(citations.invalidMarkers, ["[7]"]);
assert.equal(validateKnowledgeCitations("A general explanation.", []).answer, "A general explanation.");
const noEvidenceCitations = validateKnowledgeCitations("The unverified policy is [1].", []);
assert.equal(noEvidenceCitations.answer, "The unverified policy is [1].");
assert.deepEqual(noEvidenceCitations.invalidMarkers, []);

console.log("PASS ShieldMind search-term extraction, title-weighted relevance, retrieval freshness and citation validation");
