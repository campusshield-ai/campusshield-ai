# NUC university directory reconciliation — 16 October 2026

**Authoritative reference:** National Universities Commission, Nigerian University System  
https://enuc.nuc.edu.ng/nus

The live NUC directory currently reports 77 federal, 69 state and 182 private universities (328 total). It includes universities approved or renamed after the directory snapshot used by the original import migration.

## Changes in migration `20261016150000_reconcile_nuc_directory_live_deltas.sql`

The first migration corrects 16 high-confidence existing records and initially added a Mewar University row:

- Corrects the state for Federal University Gashua (Yobe), Federal University Dutsin-Ma (Katsina), Federal University Otuoke (Bayelsa), Federal University Gusau (Zamfara), and Jigawa State University of Allied and Medical Science (Jigawa).
- Adds Mewar University, Masaka, Nasarawa State, which was present in the live NUC listing but absent from the baseline seed.
- Corrects current NUC display names for City University, Millennium Crest University, Transatlantic University of Medicine and Health Sciences, Baba-Ahmed University, Modibbo Adama University, Michael Okpara University of Agriculture, Federal University of Health Sciences at Funtua, Federal University of Agriculture and Developmental Studies at Iragbiji, Federal University of Agriculture and Technology at Okeho, Cross River University of Education and Entrepreneurship, and Ebonyi State University of Aeronautics and Aerospace Engineering.

The first migration updates 16 existing rows by slug and initially inserted a second Mewar alias row. The audit found a naming conflict: the live NUC NUS table says **Mewar University**, while the NUC private-universities page and the university's own website say **Mewar International University**. The baseline already contains the latter. A fourth migration, `20261016180000_deactivate_duplicate_mewar_alias.sql`, keeps the newly added alternate row inactive pending NUC clarification, preserves its ID, and aborts if any campus/student records reference it. The existing Mewar International University row remains active. This is a conservative hold, not a claim that the two official names have been conclusively reconciled. A second migration, `20261016160000_reconcile_nuc_name_variants.sql`, corrects 15 high-confidence spelling/location variants by existing slug. A third migration, `20261016170000_reconcile_nuc_state_mismatch.sql`, corrects the confirmed Mercy Medical University location from Ogun to Osun. All four migrations have been applied to staging only.

## Important release status

This is a **verified delta, not certification of all 328 rows**. The original migration's 5 September 2026 snapshot still needs a complete row-by-row comparison with the live NUC register. In particular, review any NUC additions, removals, ownership changes, campus/location changes, aliases/renames, and website fields before declaring the directory complete. Do not infer that equal record counts mean the records match.

## Required staging verification

1. Apply this migration to a disposable/staging database only; do not apply it to production as part of this PR.
2. Compare all 328 database rows with the current NUC register, recording each discrepancy and preserving existing slugs/IDs.
3. Check for duplicate institutions caused by renames/aliases before adding rows; do not auto-merge institutions where identity is ambiguous.
4. Confirm the directory listing RPC returns the corrected names/states and the identity form remains locked to the user's registered campus.
5. Run the fictional-account browser walkthrough for search, mismatch rejection, private document upload, and administrator approve/reject.
6. Keep PR #8 and PR #13 unmerged until the existing release gates pass.


## Automated live-page comparison (16 October 2026)

GitHub Actions run #195 fetched the live NUC HTML table and parsed **328 current rows** (77 Federal, 69 State, 182 Private). Comparing the current NUC names with the checked-in seed plus the staging delta produced:

- **158 exact normalized-name matches** after the 15 name corrections, Mercy state correction, and inactive Mewar alias.
- **144 one-to-one candidate pairs** for manual review; two candidates have state differences and were not auto-applied.
- **88 database rows and 87 NUC rows** still unresolved after those conservative pairs.
- **0 duplicate normalized database names** in the reconstructed roster.
- The active roster now has **328 rows** (77 Federal, 69 State, 182 Private), matching the NUC table counts. One duplicate Mewar alias remains stored but inactive (329 total rows including that inactive alias), preserving its ID for auditability.

These counts show why a simple count or exact-name match is insufficient. The detailed row-by-row candidates and unresolved entries are attached to GitHub Actions as the `nuc-roster-audit` artifact (latest successful run: [run #195](https://github.com/campusshield-ai/campusshield-ai/actions/runs/38875105769)); the audit is deliberately non-destructive and does not auto-merge institutions.

### Conflicting official names requiring human review

Some NUC pages disagree with each other or with institution naming used elsewhere. For example, the live NUS table lists **African School of Economics**, while the NUC private-universities page lists **African University of Economics**; both are official NUC pages. Similarly, the live NUS table uses **Mewar University**, while the NUC private-universities page and the institution's website use **Mewar International University**. The live NUS table also lists **Cross River University of Technology** while the database has **University of Cross River State**, and the live table calls the Ozoro institution **University of Science and Technology, Ozoro** while the NUC state-universities page lists **Delta University of Science and Technology, Ozoro**. The live NUS page spells **Kantagora** for the Federal University of Education, while the database uses **Kontagora**. These are not safe to resolve through fuzzy matching alone.

Before changing or deactivating any unresolved row, compare the NUC detail record and the institution's official website, then decide whether it is a rename, alias, stale record, or genuinely distinct institution. Preserve existing IDs and foreign-key relationships. Do not delete records just to force the count to 328.

### Current staging status

All three reconciliation migrations (`reconcile_nuc_directory_live_deltas`, `reconcile_nuc_name_variants`, and `reconcile_nuc_state_mismatch`) have been applied to **CampusShield AI Staging** only. Read-only verification returned 329 active rows with distinct slugs, all 16 correction targets present, one Mewar University row, a private `student-identity-documents` bucket, zero identity submissions, and zero objects in that bucket. No identity documents were uploaded. This is staging data only; the production project was not modified.

### Remaining release gates

- Resolve the 88/87 unresolved roster rows using official source review; only then generate a reviewed follow-up delta for the confirmed additions, renames and state/ownership corrections.
- Perform the real browser walkthrough with fictional accounts and dummy files. Static smoke tests and SQL policy inspection are not a substitute for signing in as test users, uploading a dummy document, checking cross-campus denial, and approving/rejecting as an authorized campus administrator.
- PR #8 currently reports a dirty merge state against `main`; resolve its merge conflicts before merge. PR #8's latest smoke workflow run #141 passed, but that does not clear the manual release gates.
