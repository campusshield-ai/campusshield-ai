# ShieldMind Agent Stack — Architecture and Delivery Plan

## Purpose

Evolve ShieldMind AI from a question-answering assistant into a controlled, auditable agent system for CampusShield AI. Agents may retrieve trusted campus information and invoke narrowly scoped application tools. They must not receive unrestricted database, storage, browser, or administrative access.

This document is an architecture proposal and implementation plan. It does not authorize production changes, new paid services, schema migrations, or autonomous emergency actions.

## Product architecture

Student / Staff / Verified Administrator
-> ShieldMind UI / API
-> Identity + Policy Gateway (Supabase Auth JWT, role, university scope, rate limits)
-> ShieldMind Orchestrator
-> Knowledge Agent / Campus Safety Agent / Student Support Agent / Campus Operations Agent
-> Typed tool registry
-> Server-side tool adapters
-> Supabase Edge Functions / existing APIs
-> RLS-protected tables, Storage, campus knowledge and approved notices

Every tool call passes policy checks and produces an audit event. Sensitive writes require human approval before execution.

## Initial specialist agents

1. **ShieldMind Knowledge Agent** — answers from university-approved knowledge, published notices, timetables and campus services. Answers retain source references and freshness metadata.
2. **Campus Safety Agent** — explains verified safety procedures, retrieves approved emergency contacts and helps prepare incident reports. It must not dispatch responders, invent emergency routes, or claim that help has been contacted.
3. **Student Support Agent** — guides students through registration, identity-verification steps, helpdesk and university procedures. It may create a request only through a permission-checked tool and should show the user what will be submitted.
4. **Campus Operations Agent** — supports verified university administrators with notices, campus map review queues and analytics. Publishing, approving, deleting, exporting sensitive records or changing permissions requires explicit authorization and, where appropriate, a second human confirmation.

The **ShieldMind Orchestrator** classifies intent, selects the minimum-capability agent, passes only necessary context, validates structured outputs, enforces budgets and records tool calls. Agents do not call one another freely; the orchestrator coordinates them through typed request/response contracts.

## Stack choices

| Layer | Initial choice | Rationale |
|---|---|---|
| Foundation model | OpenAI model behind a provider adapter | Reuse the existing ShieldMind provider integration; allow model changes without rewriting tools |
| Orchestration | Small server-side orchestrator first | Keep behavior explicit and testable; evaluate LangGraph/Agno only if complexity justifies it |
| Context / MCP | Internal typed tool registry; MCP adapter later | Avoid exposing every internal API as an MCP server before access controls are proven |
| Action execution | Supabase Edge Functions and existing application APIs | Keep credentials and privileged operations server-side |
| Knowledge / retrieval | Existing Supabase campus knowledge; evaluate pgvector only after checking current schema and extension state | Avoid introducing a second database or duplicating university content |
| Memory | Separate session context from approved durable preferences and campus knowledge | Never treat chat history as authoritative campus facts |
| Inter-agent protocol | Versioned JSON schemas and orchestrator routing | Predictable, validated hand-offs rather than open-ended agent chatter |
| Durable workflows | Existing Supabase-backed jobs initially; evaluate Inngest/Temporal only for long-running workflows | Avoid unnecessary infrastructure and recurring cost |
| Observability / security | Structured traces, tool audit events, redaction, rate limits, policy tests | Make agent decisions and actions inspectable |

## Tool security contract

- The model never receives a Supabase service-role key, database connection string, unrestricted SQL tool, or direct Storage administration capability.
- Every tool has a fixed schema, server-side authorization, university scope, role allow-list, input validation, output minimization, timeout and rate limit.
- The server verifies the Supabase Auth JWT and current role/membership. Client-provided role names and university IDs are never trusted.
- Existing RLS remains authoritative. Server-side privileged code must repeat authorization checks and use narrowly scoped operations.
- Read tools return only the minimum fields needed. Reporter identity, private student ID documents, credentials and unrelated records are excluded by default.
- Write tools use idempotency keys and explicit user confirmation. Sensitive administrative operations require verified admin status and human approval.
- Prompt injection in crawled pages, uploaded files, notices or user messages is treated as untrusted content, never as policy or tool authorization.
- The system must refuse to fabricate campus information, map geometry, emergency contacts, verification status or claims that an action succeeded.
- Consequential tool calls record actor, university, tool name, resource identifier, policy decision, approval reference, outcome and timestamp, with secrets and sensitive payloads redacted.

## Memory boundaries

1. **Working memory:** short-lived conversation/task context, scoped to the active user and session.
2. **User preferences:** only explicit, useful, user-approved preferences; no sensitive personal inference.
3. **Campus knowledge:** institution-approved, source-linked and versioned content. It is not personal memory.
4. **Operational state:** workflow records in application tables, protected by RLS and retention rules.

Memory retrieval must respect user identity, university membership and record visibility. A student's conversation must never become a source for another student's answer.

## Delivery phases

### Phase 0 — Discovery and safety baseline
- Inventory existing ShieldMind endpoints, provider adapter, campus knowledge tables, Auth claims, roles, RLS policies and audit facilities.
- Identify current staging-only test accounts and existing test harnesses.
- Define tool contracts and a threat model before enabling writes.
- No schema or production changes in this phase.

### Phase 1 — Knowledge Agent
- Implement a read-only retrieval tool over approved campus knowledge.
- Return citations/source URLs, university scope, last-updated date and confidence/coverage indicators.
- Add tests for cross-university isolation, stale/empty knowledge, prompt injection and unsupported answers.
- Release to staging behind a feature flag.

### Phase 2 — Orchestrator and tool gateway
- Add typed intent routing, allow-listed tools, structured outputs, timeouts, token/cost budgets and audit events.
- Verify role and university scope server-side on every call.
- Add adversarial tests for forged role claims, IDOR, prompt injection and tool argument manipulation.

### Phase 3 — Safety and Student Support agents
- Begin read-only: approved contacts, published safety guidance, registration instructions and helpdesk guidance.
- Add draft-only incident/helpdesk submission with user review before final submission.
- No autonomous dispatch, map publication, identity approval or other sensitive action.

### Phase 4 — Campus Operations agent
- Admin-only read and draft workflows first.
- Add publish/approve actions only after verified administrator sessions, explicit confirmation and audit review are tested end-to-end.

### Phase 5 — Durable workflows and interoperability
- Add retries, resumability, idempotency and human hand-off for long-running work.
- Introduce MCP or A2A only where a real external integration requires interoperability; do not add protocols for appearance alone.

## Required acceptance tests

- Student A cannot retrieve Student B's records or another university's unpublished data.
- A student cannot invoke administrator tools by prompt injection or forged request fields.
- Knowledge answers cite approved sources and clearly say when information is missing or stale.
- A malicious campus webpage cannot override system policy or trigger a tool call.
- Tool failures and timeouts do not create duplicate reports or requests.
- Sensitive actions require an explicit confirmation/approval record and are auditable.
- Emergency agent never claims a dispatch or response occurred unless a separately verified integration confirms it.
- Secrets and private identity documents never appear in prompts, logs, traces or model-visible tool output.
- Staging role-based and authenticated browser tests pass before any production rollout.

## Release boundary

This workstream is separate from CampusMap PR #134. Do not merge this proposal into PR #134. Do not apply migrations, alter production secrets, deploy production functions, publish campus data or enable live emergency actions as part of this foundation document. All implementation begins in a dedicated branch and staging environment, with a separate reviewed pull request.


## Initial Staging discovery — 2026-10-31

Read-only inspection of CampusShield AI Staging (project ref `hywcpnoqqhxvujnimhxl`) found:

- Existing tables are available for `campus_knowledge_sources`, `campus_knowledge_pages`, `campus_university_service_directory`, `campus_memberships`, `campus_notices`, `campus_helpdesk_tickets` and `incidents`.
- RLS is enabled on the inspected knowledge, membership and profile tables. Knowledge-page reads are restricted to published pages for the caller's current university and an active, verified membership. Knowledge-source reads are likewise scoped to the caller's current university.
- The current knowledge-pages table contains zero rows and zero published pages. The first Knowledge Agent therefore needs an empty-knowledge response and cannot yet be treated as a useful campus-answering service.
- The inspected database does not currently have the `vector` extension installed. Do not add pgvector or create embedding columns until the existing content volume, retrieval quality, extension availability and staging migration plan are evaluated.
- Existing ShieldMind-related database functions include caller eligibility and quota controls, plus personal planner operations. These are not a general-purpose agent tool gateway and must not be exposed wholesale to an LLM.
- Existing service directory and crawler metadata can be reused as source records, but their freshness and source verification must be checked before answers are labelled authoritative.

This was read-only inspection. No database rows, policies, functions, extensions, migrations or secrets were changed. Next implementation work should inspect the existing ShieldMind request path and its provider integration, then define a read-only knowledge retrieval adapter that reuses current RLS rather than bypassing it.
