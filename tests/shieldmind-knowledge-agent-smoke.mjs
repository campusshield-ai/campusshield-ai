import assert from "node:assert/strict";
import {
  extractKnowledgeKeywords,
  retrieveApprovedCampusKnowledge,
} from "../supabase/functions/_shared/shieldmind-knowledge-agent.js";

assert.deepEqual(
  extractKnowledgeKeywords("What are the admission requirements and application deadline?"),
  ["admission", "requirements", "application", "deadline"],
  "keyword extraction removes common words and caps the retrieval terms",
);
assert.deepEqual(extractKnowledgeKeywords("!!!"), [], "empty keyword sets are safe");

let queryCalls = [];
const fixtures = [
  {
    title: "Admission requirements",
    url: "https://university.example/admissions",
    body_text: "Admission requirements include the application process and required documents.",
    fetched_at: "2026-10-01T00:00:00.000Z",
  },
  {
    title: "Academic calendar",
    url: "https://university.example/calendar",
    body_text: "The academic calendar lists semester dates and examination deadlines.",
    fetched_at: "2026-10-20T00:00:00.000Z",
  },
];
const fakeClient = {
  from(table) {
    assert.equal(table, "campus_knowledge_pages");
    const query = {
      eq(field, value) { queryCalls.push(["eq", field, value]); return this; },
      select(value) { queryCalls.push(["select", value]); return this; },
      or(value) { queryCalls.push(["or", value]); return this; },
      order(field, options) { queryCalls.push(["order", field, options]); return this; },
      limit(value) { queryCalls.push(["limit", value]); return Promise.resolve({ data: fixtures, error: null }); },
    };
    return query;
  },
};

assert.deepEqual(
  await retrieveApprovedCampusKnowledge({
    client: fakeClient,
    universityId: "university-1",
    isVerifiedCampusMember: false,
    question: "admission deadline",
  }),
  [],
  "unverified accounts cannot retrieve campus-specific knowledge",
);
assert.equal(queryCalls.length, 0, "unverified access does not query the database");

const sources = await retrieveApprovedCampusKnowledge({
  client: fakeClient,
  universityId: "university-1",
  isVerifiedCampusMember: true,
  question: "admission requirements and academic calendar deadline",
});
assert.ok(sources.length <= 4, "retrieval has a strict source cap");
assert.ok(sources.some((source) => source.url.endsWith("/admissions")), "relevant official page is returned");
assert.ok(queryCalls.some((call) => call[0] === "eq" && call[1] === "source.status" && call[2] === "approved"),
  "paused source records are excluded");
assert.ok(queryCalls.some((call) => call[0] === "eq" && call[1] === "status" && call[2] === "published"),
  "only published pages are retrieved");
assert.ok(queryCalls.some((call) => call[0] === "eq" && call[1] === "university_id" && call[2] === "university-1"),
  "retrieval is scoped to the verified caller's university");
assert.ok(sources.every((source) => !("relevance" in source)), "internal relevance scores are not exposed");

const errorClient = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      or() { return this; },
      order() { return this; },
      limit() { return Promise.resolve({ data: null, error: new Error("database unavailable") }); },
    };
  },
};
assert.deepEqual(
  await retrieveApprovedCampusKnowledge({
    client: errorClient,
    universityId: "university-1",
    isVerifiedCampusMember: true,
    question: "admission requirements",
  }),
  [],
  "retrieval errors fail closed instead of returning partial or guessed knowledge",
);

console.log("ShieldMind Knowledge Agent smoke checks passed.");
