# ShieldMind AI — Staging-Only Implementation Plan

**Parent platform:** CampusShield AI  
**Assistant name:** ShieldMind AI  
**Status:** Planning only; no AI runtime, provider credentials, schema, or user-facing feature is enabled by this document.  
**Target branch:** `codex/shieldmind-ai-staging-plan`  
**Staging Supabase project:** `hywcpnoqqhxvujnimhxl`  
**Production Supabase project:** `fvgtnujjnvdkhzqqcaqe` — explicitly out of scope.

## Goal

Introduce ShieldMind AI as a trustworthy campus learning assistant while preserving CampusShield's existing safety, identity, campus-scoping, and privacy controls. This first change is a plan for review, not a deployment or a live AI integration.

## Non-negotiable safety boundaries

1. **Staging only.** All feature work and experiments must use the staging-configured branch and staging Supabase project. Never point a browser build, test, migration, or AI provider integration at production during development.
2. **No incident data in AI context.** Do not send incident reports, incident descriptions, reporter identities, risk assessments, emergency/safety case details, private Helpdesk requests, identity documents, student numbers, or private classroom/attendance records to a model, embedding service, analytics pipeline, or prompt log. Do not use incident data for retrieval, training, or evaluation.
3. **Official information must be source-grounded.** Answers about university rules, deadlines, services, policies, or official announcements must retrieve only from approved, campus-scoped, published sources. Show source title, issuing institution/department, and last-updated date where available. If no suitable source exists, say so and direct the student to the relevant official office; never invent policy.
4. **Authorization is server-side.** Do not rely on hidden navigation or client-side role checks. Reuse the signed-in user's verified campus membership and existing database access controls. Fail closed if identity, campus, publication status, or permissions cannot be verified.
5. **Keep private records private.** No prompt, transcript, memory, retrieval index, cache, or diagnostic log may contain private student documents or data belonging to another user/campus. Do not log secrets, provider keys, access tokens, or full prompts containing personal data.
6. **No unlimited-use promise.** Apply configurable per-user and per-campus rate limits, request-size limits, timeouts, and cost ceilings before inviting real users. Show a clear usage limit and an understandable error state.
7. **Human responsibility remains.** ShieldMind is educational support, not an emergency dispatcher, official decision-maker, medical/legal adviser, or replacement for lecturers or university offices. Safety incidents must continue through the existing protected reporting workflow.

## Delivery sequence

### Phase 0 — Planning and source inventory (this change)

- Record the architecture, scope, threat boundaries, and acceptance checks.
- Inventory approved public or officially published campus learning resources.
- Identify where existing verified-campus context and authentication checks can be reused without broadening data access.
- Do not change database schema, RLS policies, storage policies, production configuration, or the deployed website.

**Exit criteria:** plan reviewed; source owners and allowed source types identified; no private data enters the proposed AI context.

### Phase 1 — Read-only ShieldMind Q&A prototype

- Add a separate ShieldMind interface that is accessible only through the existing authenticated, verified-account and campus gates selected for the feature.
- Use a server-side endpoint or trusted backend function for model calls; never put provider secrets in browser JavaScript.
- Retrieve from an allowlisted set of published campus documents and approved academic resources.
- Attach citations to grounded answers and provide an explicit “I couldn't verify this” response for unsupported questions.
- Keep conversations ephemeral for the first prototype; do not persist chat history by default.
- Use fictional synthetic questions and documents for tests.

**Acceptance checks:**
- A student cannot retrieve another campus's content by changing request parameters.
- Pending, rejected, signed-out, or otherwise ineligible accounts are denied according to the feature access policy.
- Unpublished, expired, or unapproved material is never returned.
- Unsupported official-policy questions produce a refusal to guess and a source/office referral.
- Incident, identity, Helpdesk, attendance, and other private records are excluded from retrieval and prompts.
- Provider timeout, rate limit, and malformed output fail safely without exposing keys or internal errors.

### Phase 2 — Study notes, quizzes, and revision

- Allow users to generate study notes and quizzes from text they provide or from approved learning materials they are allowed to access.
- Mark AI-generated material as a study aid; encourage checking against course materials.
- Limit uploads and text size; inspect file types and reject executable or unsupported content.
- Do not ingest private identity documents or automatically index all files in a user's account.
- Test for prompt injection in source documents, unsafe instructions, hallucinated answers, and cross-user/campus leakage.

**Acceptance checks:** generated questions are traceable to the permitted source or clearly labelled as general practice; uploaded material is processed only for the requesting user; unsupported file types and oversized requests are rejected.

### Phase 3 — Timetable planning, reminders, and synchronization

- Start with user-entered or user-authorized timetable information.
- Make calendar connections opt-in and request the minimum permissions needed.
- Keep timetable data separate from incident reporting and identity verification.
- Define retention, deletion, account-switch, and synchronization-conflict behavior before enabling cloud sync.
- Do not send reminders or create external calendar events without clear user consent.

**Acceptance checks:** users can inspect and delete saved timetable data; account switching cannot reveal the previous user's schedule; external actions require explicit consent.

### Phase 4 — Optional premium capabilities

- Consider premium tiers, more capable models, and priority support only after measuring real demand, educational value, provider reliability, and per-user cost.
- Publish clear usage limits and pricing before taking payment.
- Use model routing and quotas to control cost; never market “unlimited AI” unless enforceable capacity and abuse controls genuinely support it.
- Do not collect payment details directly in the app; use a vetted payment provider if a paid tier is approved later.

**Acceptance checks:** budget caps and rate limits are enforced server-side; failures do not bypass limits; pricing and data-use disclosures are visible; billing is not activated as part of this plan.

## Proposed high-level architecture

1. **CampusShield frontend:** ShieldMind screen, clear AI disclaimer, citations, loading/error states, and visible usage limits.
2. **Authenticated backend boundary:** validates session, account status, verified campus membership, request size, rate limits, and allowed feature access.
3. **Approved-source retrieval:** reads only allowlisted, published academic/campus information scoped to the requesting campus. No incident or private student tables are eligible sources.
4. **Model provider adapter:** server-side secrets only; configurable provider/model; timeouts and token/cost budgets; no training on submitted content where provider controls permit this.
5. **Privacy-conscious telemetry:** aggregate counts and latency only. No raw prompts, completions, identity data, incident content, or access tokens in ordinary logs.
6. **Tests and release gates:** static smoke checks plus authenticated staging browser and cross-campus authorization tests before any release proposal.

This is a target architecture, not a claim that these components already exist.

## Implementation and review checklist

- [ ] Confirm which campus documents and academic sources may be indexed and who maintains them.
- [ ] Confirm the initial verified-account eligibility policy with the project owner.
- [ ] Choose a server-side model integration and review its data-retention/training terms.
- [ ] Add an explicit allowlist for source tables/storage paths; default deny all other sources.
- [ ] Threat-model prompt injection, cross-campus retrieval, unsafe output, abuse, and provider outage.
- [ ] Add tests proving incident and identity data are never included in retrieval or prompts.
- [ ] Add rate limits, cost ceilings, request limits, and safe error handling.
- [ ] Run static checks and signed-in staging browser tests using fictional accounts and synthetic data.
- [ ] Review the resulting diff and security findings before requesting approval.
- [ ] Obtain explicit owner approval before merge, production configuration, production migration, deployment, paid-provider activation, or publication.

## Out of scope for this plan

- No Supabase migration or RLS/grant/storage-policy changes.
- No changes to production project `fvgtnujjnvdkhzqqcaqe` or the live website.
- No provider account creation, paid usage, subscriptions, or payment activation.
- No merging, publishing, or deploying.
- No use of real student identity documents or real incident reports in tests.
- No AI access to safety reports or private student records.

## Existing release dependencies

CampusShield already has other open, stacked/draft feature work, including student identity verification (PR #26) and classroom/private opportunity work (PR #25). ShieldMind should remain isolated on its own branch and must not be merged in a way that bypasses those branches' dependency and security reviews. A passing static check alone is not proof of cross-campus isolation; authenticated staging tests remain required.
