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


## Latest automated audit result

The successful live audit run [#229](https://github.com/campusshield-ai/campusshield-ai/actions/runs/38877911335) parsed 328 NUC records and reconstructed 328 active roster records (329 stored rows including the inactive Mewar alias). It reports **176 exact normalized-name matches**, including the 17 manually reviewed display-name corrections and the Sokoto correction. Ownership/state mismatches among exact-name matches: 0.

The report still lists **8 unmatched database rows and 8 unmatched NUC rows after the advisory candidate-pair step**. They are not eight certified pairs. The fuzzy candidate pairing is advisory and can consume the wrong row when names are similar but state/location differs; do not treat the candidate count as certification.

Unmatched database rows:
- Bowen University, Iwo — Private / Osun
- Redeemer's University, Ede — Private / Osun
- David Nweze Umahi Federal University of Medical Sciences, Uburu — Federal / Ebonyi
- University of Cross River State, Calabar — State / Cross River
- University of Medical Sciences, Ondo City, Ondo State — State / Ondo
- Kashim Ibrahim University, Maiduguri, Borno State — State / Borno
- Lagos State University of Education, Ijanikin — State / Lagos
- Elrazi Medical University, Kano — Private / Kano

Unmatched live NUC rows:
- Cross River University of Technology, Calabar — State / Cross River
- King David Umahi University of Medical Sciences, Uburu, Ebonyi State — Federal / Ebonyi
- Elrazi University of Medical Sciences, Kano, Kano State — Private / Kano
- Lagos University of Education, LASUED, Oto/Ijanikin, Lagos State — State / Lagos
- Bowen University, Iwo, Ogun State — Private / Ogun
- Redeemer's University, Mowe, Ogun State — Private / Ogun
- Ondo State University of Medical Sciences — State / Ondo
- Rivers State University of Science & Technology, Port Harcourt, Rivers State — State / Rivers

This list deliberately remains unresolved because NUC pages disagree on naming and/or location. Preserve the stable IDs and campus relationships; do not force aliases into merges or rename locations based on a single conflicting source. The 144 fuzzy suggestions remain unverified and require source review before full roster certification.

## Deliberately not changed

These records still require authoritative clarification; no automated or guessed change was applied:

- **Bowen University / Redeemer's University:** live NUS location/state fields conflict with the institutions' own addresses. Bowen's official site gives Iwo, Osun State ([source](https://bowen.edu.ng/plan-your-visit/)); Redeemer's official staff portal gives Ede, Osun State ([source](https://staff.run.edu.ng/index.php?success=0)). Keep the existing Osun location; do not copy the NUC NUS Ogun/Mowe location into the canonical record.
- **Cross River University of Technology / University of Cross River State:** the live NUS table and NUC state-university listing use different names. Preserve the current canonical name until NUC reconciles its own listings.
- **David Nweze Umahi Federal University of Medical Sciences / King David Umahi University of Medical Sciences:** NUC's historical takeover/renaming notice ([source](https://www.nuc.edu.ng/fg-takes-over-renames-david-umahi-varsity-uburu/)) and current live NUS display are inconsistent.
- **University of Medical Sciences, Ondo / Ondo State University of Medical Sciences:** NUC sources use different names. The institution's current official site uses **University of Medical Sciences, Ondo** ([source](https://www.unimed.edu.ng/)); keep that canonical display.
- **Kashim Ibrahim University / Borno State University:** the institution's official site says it was established as Borno State University and renamed in 2025 ([source](https://www.kiu.edu.ng/)); the 2025 state gazette amends the law to replace “Borno State University” with “Kashim Ibrahim University” ([gazette](https://kiu.edu.ng/documents/AMENDMENTS.pdf)). The database display was corrected to **Kashim Ibrahim University, Maiduguri, Borno State** while preserving the stable slug. The live NUC NUS entry still appears to use the former name.
- **Lagos State University of Education / Lagos University of Education:** NUC sources differ on the name. The institution's official site consistently uses **Lagos State University of Education** ([source](https://lasued.edu.ng/)); preserve that canonical display pending NUC clarification.
- **Rivers State University / Rivers State University of Science & Technology:** current state-university listing and live NUS display differ. The institution's own site identifies the older name as its former name ([source](https://www.rsu.edu.ng/surveying-and-geomatics/)); this is a confirmed rename alias, not a separate university.
- **Elrazi Medical University / Elrazi University of Medical Sciences:** the institution's current official site uses **Elrazi Medical University, Kano** ([source](https://www.elrazi.edu.ng/)), while the live NUC NUS row uses “Elrazi University of Medical Sciences”. The database display was corrected to the official institution name with the existing slug preserved; the NUC display conflict remains open.
- **Mewar University / Mewar International University:** already held as an inactive alias candidate pending NUC clarification; the existing canonical record remains active.

## Verification required

Run the live NUC audit workflow after this migration is included. Use its generated artifact to confirm the new exact-match count and review the remaining unmatched rows. Do not declare the roster fully certified merely because row counts match. Any remaining ambiguous identity, ownership or location discrepancy must stay documented and unchanged until an authoritative source resolves it.

All work is intended for the CampusShield AI staging reconciliation path only. Do not apply these migrations to production as part of this review.
