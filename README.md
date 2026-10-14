# CampusShield AI 🛡️

### Intelligent Campus Safety & Emergency Response System

**CampusShield AI** is a technology-driven campus safety project designed to help universities improve incident reporting, visualize safety risks, and support faster emergency response.

🌐 **Live Website:** https://campusshield-ai.github.io/campusshield-ai/

## 🚀 Project Overview

CampusShield AI aims to make campus environments safer by combining interactive mapping, incident monitoring, risk visualization, and data analytics in one platform.

The project is being developed with Nigerian university campuses in mind.

## ✨ Current Features

- **Incident reporting** — Submit categorized reports to the configured Supabase project.
- **Incident management** — Search and filter records visible to the signed-in account; verified security and administrator accounts can mark reports resolved when database policies permit it.
- **Dashboard statistics** — Counts and recent reports are calculated from loaded Supabase records available to the account.
- **Account verification** — Student and teacher access is subject to administrator review.
- **Illustrative triage calculator** — A rule-based guide for human review, not a validated model, probability, or prediction.
- **Responsive workspace** — Layout adapts to desktop, tablet, and phone screens.
- **PWA install setup** — Android browsers can offer installation when their browser criteria are met; iPhone and iPad users can add CampusShield from Safari’s Share menu.


- **Privacy-preserving campus community** — Public cards show chosen usernames, not real names or email addresses.
- **Username customization** — New accounts choose a unique handle; signed-in users can change it with a cooldown.
- **Reviewed community posts** — Students can submit public-safe safety issues and improvement suggestions; these stay out of the public feed until reviewed.
- **Comments and replies** — Students can discuss published community posts using their public handles.
- **Verified staff announcements** — Approved teacher, security, and administrator accounts can publish clearly labelled official updates.
- **Community moderation** — Authorized staff can publish or reject submissions, hide reported content, and review user reports.

The current app does not include an interactive campus map. Map-based views remain a future feature.

## 🎯 Our Mission

To develop accessible technology that helps universities identify safety concerns, organize incident information, and make more informed campus safety decisions.

## 🛠️ Technology

- HTML
- CSS
- JavaScript
- Interactive mapping and data visualization technologies

## 🧪 Development Status

**Status:** Active Development

CampusShield AI is a developing project. It should not yet be considered a verified emergency dispatch service or a replacement for campus security and official emergency services.

The prototype does not contact emergency services. Use fictional information in this development environment.

## 📲 Install on a phone

Open the live website over HTTPS on your phone. On Android, use the browser’s **Install app** prompt or choose **Install app / Add to Home screen** from its menu. On iPhone or iPad, open the site in Safari, tap **Share**, then choose **Add to Home Screen**. This installs the website from the browser; it does not publish a separate Play Store or App Store listing.

For Android Chrome’s in-app install button, the deployed HTTPS page must pass Chrome’s install checks. Chrome may wait until the user has interacted with the site and spent time on it before firing the install event; an install option in the browser menu can appear on different terms. A local `file://` preview cannot verify installation eligibility.

CampusShield requires an internet connection to sign in and load or submit reports. The offline screen stores no reports, sign-in sessions, or Supabase responses. This prototype does not contact emergency services.

## 🔐 Data and access

The browser uses the Supabase publishable key, which is intended for public client applications. Never place a Supabase secret or `service_role` key in browser code. Database Row Level Security policies are the access-control boundary; interface role checks only shape the user experience and do not replace RLS. Dashboard counts reflect the rows Supabase makes available to the signed-in user.

## 🧑‍🤝‍🧑 Campus Community and privacy

The campus community is intentionally separate from private incident reporting. A student must submit a public-safe issue or suggestion separately; submitting a private incident does not automatically publish or share that incident.

- Public posts and comments store a username snapshot for display.
- Real names and email addresses are not rendered in community cards or comments.
- Username changes are validated and checked for uniqueness by a database function.
- Student community posts require review before publication; verified staff announcements are labelled as official.
- Students can report posts and comments. Verified teachers, security personnel, and administrators can moderate community content.
- Supabase Row Level Security and restricted column grants protect internal author IDs and report submitter IDs from community queries.
- Sensitive incidents (including medical emergencies, threats, harassment, or cases containing identifying evidence) should use private incident reporting and must not be copied into public community posts.
- Public posts and comments are not a substitute for a validated emergency-response system. The prototype still does not contact emergency services.

The additive database migrations, applied in order to the connected CampusShield Supabase project, are `supabase/migrations/20261014230000_add_community_privacy_feed.sql`, `supabase/migrations/20261014233000_sync_community_username_snapshots.sql`, `supabase/migrations/20261014234000_restrict_username_availability.sql`, `supabase/migrations/20261014235000_remove_username_availability_rpc.sql`, and `supabase/migrations/20261014240000_allow_verified_teachers_to_read_profiles.sql`. Apply all five in order when setting up another environment before deploying the updated frontend/backend files.

## 🏫 Multi-university foundation

CampusShield is being designed as separate university spaces on one platform. A signed-in account has one campus membership at a time, and a database-enforced university ID scopes community posts, comments, moderation queues, events, groups, marketplace listings, and incident records. Campus selection is locked after joining; transfers need support review. The public university directory starts with a curated set of NUC-listed institutions and supports requests for missing universities. **Do not describe the nationwide directory as complete until the full current NUC list is imported and reviewed.**

The feature branch now includes UI for campus posts, questions, polls, likes, threaded replies, reposts, bookmarks, same-campus follows, course/department groups, events and RSVPs, marketplace listings, and campus-only moderation. Cross-university follows, comments, groups, marketplace access, and other student-to-student interactions are deliberately disabled. A platform-admin console is included for reviewing requests for missing universities and assigning already-verified campus staff, but these controls require the database owner to provision at least one trusted user ID in the private platform-admin registry. Private photo/video upload and signed-URL display are wired to the private storage bucket; they still require browser-level verification against staging before release.

A separate project named CampusShield AI Staging was created in eu-west-1. The eleven multi-university migrations in this branch, plus a schema-only baseline for earlier repository migrations, were applied in staging only; production remains unchanged. Staging SQL tests with fictional users confirmed that a second university cannot read the first university's incidents, posts, groups, events, or marketplace listings, and cross-campus comment, follow, report, and RSVP attempts are rejected. Incident submission, staff resolution, post moderation, account approval, university-request review, and the trusted-admin bootstrap guard also passed SQL-level checks. These checks simulate authenticated JWT claims and are not a full browser login test. The official NUC eNUC directory currently reports 77 federal, 69 state and 182 private universities (328 total); the current directory in this branch remains a starter subset, not the complete current NUC list. Source: https://enuc.nuc.edu.ng/nus. The migrations are:
- `20261015000000_multi_university_foundation.sql` — campus membership, university-scoped RLS and core social schemas
- `20261015010000_campus_staff_membership_review.sql` — first campus-admin bootstrap and campus-specific staff verification
- `20261015020000_campus_social_actions.sql` — reactions, follows, polls, reposts, bookmarks and replies
- `20261015030000_private_campus_media.sql` — private media storage schema and storage policies (upload UI pending)
- `20261015040000_campus_groups_events_marketplace.sql` — group, event and marketplace permissions/moderation
- `20261015050000_marketplace_reporting.sql` — campus-only scam/listing reports
- `20261015060000_social_directory_helpers.sql` — private listing-ownership status helper
- `20261015070000_campus_role_scoping.sql` — campus-specific staff roles and a trusted platform-admin assignment function
- `20261015080000_harden_campus_rpc_permissions.sql` — restricts privileged campus RPC execution to authenticated users
- `20261015090000_require_preprovisioned_platform_admin.sql` — requires database-owner provisioning before a user can exercise platform-admin bootstrap
- `20261015100000_platform_admin_console_rpcs.sql` — trusted platform-admin RPCs for reviewing university requests and listing eligible staff

The source smoke-check workflow runs on GitHub Actions and should be green before merge. Staging SQL syntax and two-university isolation checks have been completed; the remaining release gate is a real browser test using staging Supabase Auth and the updated frontend, including file upload and signed-image/video playback. Do not merge or deploy until these browser checks pass. The complete current NUC directory is still outstanding. The database owner must explicitly insert the trusted platform administrator's user ID into the private platform-admin registry in a controlled SQL session before the platform-admin console can be used. The public bootstrap RPC cannot let a user add themselves to that table.

## 🔮 Future Plans

- Interactive campus map
- Improved incident reporting and categorization
- Advanced analytics and trend visualization
- Risk monitoring and alert features
- Administrative dashboard improvements
- Interactive campus map and safety notifications
- AI-assisted trend summaries and duplicate-issue detection after appropriate validation

## 👥 Team

Built by the CampusShield AI project team.

## 🤝 Contributions

Suggestions, feedback, and collaboration that improve campus safety technology are welcome.

## 📄 Disclaimer

CampusShield AI is a technology development project. Any risk indicators or analytics are intended to support assessment and should not be treated as confirmed predictions of criminal activity or emergencies.

---

**CampusShield AI — Building Safer Campuses Through Technology.**
