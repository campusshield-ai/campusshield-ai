# NUC university directory reconciliation — 16 October 2026

**Authoritative reference:** National Universities Commission, Nigerian University System  
https://enuc.nuc.edu.ng/nus

The live NUC directory currently reports 77 federal, 69 state and 182 private universities (328 total). It includes universities approved or renamed after the directory snapshot used by the original import migration.

## Changes in migration `20261016150000_reconcile_nuc_directory_live_deltas.sql`

The first migration corrects 16 high-confidence existing records against the live NUC listing and adds one current NUC-listed university missing from the baseline snapshot:

- Corrects the state for Federal University Gashua (Yobe), Federal University Dutsin-Ma (Katsina), Federal University Otuoke (Bayelsa), Federal University Gusau (Zamfara), and Jigawa State University of Allied and Medical Science (Jigawa).
- Adds Mewar University, Masaka, Nasarawa State, which was present in the live NUC listing but absent from the baseline seed.
- Corrects current NUC display names for City University, Millennium Crest University, Transatlantic University of Medicine and Health Sciences, Baba-Ahmed University, Modibbo Adama University, Michael Okpara University of Agriculture, Federal University of Health Sciences at Funtua, Federal University of Agriculture and Developmental Studies at Iragbiji, Federal University of Agriculture and Technology at Okeho, Cross River University of Education and Entrepreneurship, and Ebonyi State University of Aeronautics and Aerospace Engineering.

The first migration updates by the existing `slug`, asserts all 16 slugs exist, preserves primary keys and foreign-key relationships, and does not delete or deactivate institutions. A second migration, `20261016160000_reconcile_nuc_name_variants.sql`, corrects 15 high-confidence spelling/location variants by existing slug; it also preserves IDs/relationships. Both migrations have been applied to staging only.

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

GitHub Actions run #173 fetched the live NUC HTML table and parsed **328 current rows** (77 Federal, 69 State, 182 Private). Comparing the current NUC names with the checked-in seed plus the staging delta produced:

- **158 exact normalized-name matches** after the 15 additional high-confidence name corrections.
- **83 mutual high-similarity candidates** with matching ownership/state, for human review (not auto-renames).
- **88 database rows and 87 NUC rows** still unresolved after those conservative pairs.
- **0 duplicate normalized database names** in the reconstructed roster.
- The reconstructed roster currently has **329 rows** (77 Federal, 69 State, 183 Private), so it is one private record larger than the live NUC table.

These counts show why a simple count or exact-name match is insufficient. The detailed row-by-row candidates and unresolved entries are attached to GitHub Actions as the `nuc-roster-audit` artifact (run #173); the audit is deliberately non-destructive and does not auto-merge institutions.

### Conflicting official names requiring human review

Some NUC pages disagree with each other or with institution naming used elsewhere. For example, the live NUS table lists **African School of Economics**, while the NUC private-universities page lists **African University of Economics**; both are official NUC pages. The live NUS table also lists **Cross River University of Technology** while the database has **University of Cross River State**, and the live table calls the Ozoro institution **University of Science and Technology, Ozoro** while the NUC state-universities page lists **Delta University of Science and Technology, Ozoro**. The live NUS page spells **Kantagora** for the Federal University of Education, while the database uses **Kontagora**. These are not safe to resolve through fuzzy matching alone.

Before changing or deactivating any unresolved row, compare the NUC detail record and the institution's official website, then decide whether it is a rename, alias, stale record, or genuinely distinct institution. Preserve existing IDs and foreign-key relationships. Do not delete records just to force the count to 328.

### Current staging status

Both `reconcile_nuc_directory_live_deltas` and `reconcile_nuc_name_variants` have been applied to **CampusShield AI Staging** only. Read-only verification returned 329 active rows with distinct slugs, all 16 correction targets present, one Mewar University row, a private `student-identity-documents` bucket, zero identity submissions, and zero objects in that bucket. No identity documents were uploaded. This is staging data only; the production project was not modified.

### Remaining release gates

- Resolve the 88/87 unresolved roster rows using official source review; only then generate a reviewed follow-up delta for the confirmed additions, renames and state/ownership corrections.
- Perform the real browser walkthrough with fictional accounts and dummy files. Static smoke tests and SQL policy inspection are not a substitute for signing in as test users, uploading a dummy document, checking cross-campus denial, and approving/rejecting as an authorized campus administrator.
- PR #8 currently reports a dirty merge state against `main`; resolve its merge conflicts before merge. PR #8's latest smoke workflow run #141 passed, but that does not clear the manual release gates.
