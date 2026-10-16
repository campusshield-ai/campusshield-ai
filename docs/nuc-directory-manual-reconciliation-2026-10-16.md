# Manual review of the unmatched NUC roster records — 16 October 2026

Source of comparison: [NUC Nigerian University System](https://enuc.nuc.edu.ng/nus), checked against the current roster and NUC category pages where the live NUS table appears inconsistent.

## Applied in migration `20261016190000_reconcile_nuc_manual_name_matches.sql`

A manual identity review confirmed these 17 records are the same institution in the same ownership category and state as the live NUC NUS row. The migration updates **display names only by existing slug**. It does not change UUIDs, slugs, ownership, state, campus/student references, or activity status.

- Ekiti State University
- Pan-Atlantic University
- Bayelsa Medical University
- Crescent University
- Baze University
- Glorious Vision University
- Evangel University
- Augustine University
- Chrisland University
- Michael & Cecilia Ibru University
- Mountain Top University
- Ojaja University
- Precious Cornerstone
- Skyline University
- Khalifa Isiyaku Rabiu University
- Rayhaan University
- Wesley University of Science & Technology

The live NUC table's full display name is retained, including its own spelling and location wording. This is a source-alignment decision, not a claim that every NUC page is internally consistent.

A follow-up migration, `20261016200000_reconcile_sokoto_state_university_name.sql`, also aligns **Sokoto State University** to the live NUC display name **Sokoto State University, Sokoto**. It is a name-only correction by the existing slug, with ownership/state and all relationships preserved.

## Deliberately not changed

These records still require authoritative clarification; no automated or guessed change was applied:

- **Bowen University / Redeemer's University:** live NUS location/state fields conflict with known institution locations and/or the existing roster.
- **Cross River University of Technology / University of Cross River State:** the live NUS table and NUC state-university listing use different names.
- **David Nweze Umahi Federal University of Medical Sciences / King David Umahi University of Medical Sciences:** NUC's historical takeover/renaming notice and current live NUS display are inconsistent.
- **University of Medical Sciences, Ondo / Ondo State University of Medical Sciences:** NUC sources use different names.
- **Kashim Ibrahim (formerly Bornu State) University / Borno State University:** identity and current naming need an explicit authoritative source.
- **Lagos State University of Education / Lagos University of Education:** NUC sources differ on the name; preserve the existing canonical record pending clarification.
- **Rivers State University / Rivers State University of Science & Technology:** current state-university listing and live NUS display differ.
- **Elrazi Medical University / Elrazi University of Medical Sciences:** source wording is inconsistent enough that a merge/rename would be premature.
- **Mewar University / Mewar International University:** already held as an inactive alias candidate pending NUC clarification; the existing canonical record remains active.

## Verification required

Run the live NUC audit workflow after this migration is included. Use its generated artifact to confirm the new exact-match count and review the remaining unmatched rows. Do not declare the roster fully certified merely because row counts match. Any remaining ambiguous identity, ownership or location discrepancy must stay documented and unchanged until an authoritative source resolves it.

All work is intended for the CampusShield AI staging reconciliation path only. Do not apply these migrations to production as part of this review.
