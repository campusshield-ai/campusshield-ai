# NUC university directory reconciliation — 16 October 2026

**Authoritative reference:** National Universities Commission, Nigerian University System  
https://enuc.nuc.edu.ng/nus

The live NUC directory currently reports 77 federal, 69 state and 182 private universities (328 total). It includes universities approved or renamed after the directory snapshot used by the original import migration.

## Changes in migration `20261016150000_reconcile_nuc_directory_live_deltas.sql`

This migration corrects 16 high-confidence existing records against the live NUC listing and adds one confirmed current NUC-listed university missing from the baseline snapshot:

- Corrects the state for Federal University Gashua (Yobe), Federal University Dutsin-Ma (Katsina), Federal University Otuoke (Bayelsa), Federal University Gusau (Zamfara), and Jigawa State University of Allied and Medical Science (Jigawa).
- Adds Mewar University, Masaka, Nasarawa State, which was present in the live NUC listing but absent from the baseline seed.
- Corrects current NUC display names for City University, Millennium Crest University, Transatlantic University of Medicine and Health Sciences, Baba-Ahmed University, Modibbo Adama University, Michael Okpara University of Agriculture, Federal University of Health Sciences at Funtua, Federal University of Agriculture and Developmental Studies at Iragbiji, Federal University of Agriculture and Technology at Okeho, Cross River University of Education and Entrepreneurship, and Ebonyi State University of Aeronautics and Aerospace Engineering.

The migration updates by the existing `slug`, asserts all 16 slugs exist, preserves the primary keys and all foreign-key relationships, does not delete or deactivate any institution, and does not change any official website unless a later reviewed change explicitly does so.

## Important release status

This is a **verified delta, not certification of all 328 rows**. The original migration's 5 September 2026 snapshot still needs a complete row-by-row comparison with the live NUC register. In particular, review any NUC additions, removals, ownership changes, campus/location changes, aliases/renames, and website fields before declaring the directory complete. Do not infer that equal record counts mean the records match.

## Required staging verification

1. Apply this migration to a disposable/staging database only; do not apply it to production as part of this PR.
2. Compare all 328 database rows with the current NUC register, recording each discrepancy and preserving existing slugs/IDs.
3. Check for duplicate institutions caused by renames/aliases before adding rows; do not auto-merge institutions where identity is ambiguous.
4. Confirm the directory listing RPC returns the corrected names/states and the identity form remains locked to the user's registered campus.
5. Run the fictional-account browser walkthrough for search, mismatch rejection, private document upload, and administrator approve/reject.
6. Keep PR #8 and PR #13 unmerged until the existing release gates pass.
