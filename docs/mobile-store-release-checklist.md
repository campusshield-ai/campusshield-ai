# CampusShield AI — Mobile Store Release Checklist

## Scope and safety rules

- Work only on `codex/mobile-store-preparation-staging`.
- The approved Supabase staging project ref is `hywcpnoqqhxvujnimhxl`.
- Production ref `fvgtnujjnvdkhzqqcaqe` must remain unchanged.
- Do not merge, deploy, pay developer fees, upload a store build, or publish without explicit owner confirmation.
- Never put Supabase service-role or secret keys in client-side code or mobile assets.
- Use fictional accounts and dummy documents only for testing. Keep student identity documents private.
- Existing Supabase RLS, role checks, campus isolation, private storage policies, and guarded RPCs must remain the security boundary.

## Current packaging foundation

- Capacitor 8 packaging configuration and staging-guarded static asset build have been added on this branch.
- `npm run build:mobile` refuses to package assets unless `supabase-config.js` points to the staging project.
- `npm run cap:sync` builds the web assets and syncs Capacitor native projects.
- The first native build and runtime walkthrough are still required. Do not treat successful asset packaging as store readiness.
- App identifier currently proposed: `com.campusshieldai.mobile`. Check availability and finalize before creating store records; changing it later can be disruptive.

## Developer account setup — individual

### Google Play Console

1. Visit https://play.google.com/console/signup using the developer's own Google account.
2. Review the current terms, identity verification requirements, and the one-time registration fee before paying.
3. Use accurate legal and contact details. Do not share passwords or verification codes.
4. For a new personal account created after 13 November 2023, Google currently requires a closed test with at least 12 testers opted in continuously for 14 days before applying for production access.
5. Start with internal testing, then closed testing only after staging smoke tests and a privacy review pass.

### Apple Developer Program

1. Visit https://developer.apple.com/programs/ or use the Apple Developer app on an eligible iPhone/iPad.
2. Enable two-factor authentication on the Apple Account and ensure legal name/contact details are current.
3. Individual enrollment lists the developer's personal legal name as the App Store seller.
4. The program fee is currently US$99 per year (local pricing/payment options may vary).
5. Do not pay or accept enrollment terms on the owner's behalf. Owner must complete identity verification and payment personally.

## Build environment

- Node.js 22 or newer.
- Android builds: Android Studio and Android SDK.
- iOS builds: macOS with a compatible Xcode, or a vetted macOS cloud build service. A local Mac is not mandatory if cloud macOS build access is available.
- Cloud build signing credentials must be stored in the provider's secure secrets manager, never in GitHub files or app code.

## Required pre-release gates

- [ ] Confirm all branch dependency chains and merge state; do not build from an unreviewed or partially integrated release branch.
- [ ] Review mobile auth callback/deep-link behavior, password recovery, email confirmation, file upload/download and session persistence.
- [ ] Ensure mobile testing never silently redirects users into the production site or production Supabase.
- [ ] Verify private identity-document upload and access with fictional users and dummy documents.
- [ ] Test pending, verified, and rejected student flows; staff/admin permissions; same-campus access; cross-campus denial; sign-out and account switching.
- [ ] Run existing smoke tests and a real-device staging walkthrough; inspect failures rather than bypassing them.
- [ ] Add and test a real privacy policy, support contact, accurate store descriptions, screenshots, age/content rating and data-safety/privacy disclosures.
- [ ] Ensure emergency disclaimers are accurate: the prototype does not contact emergency services.
- [ ] Confirm native app offers a useful, stable experience and is not merely a thin website wrapper.
- [ ] Produce signed Android App Bundle and iOS archive/TestFlight build, then invite owner-approved testers.
- [ ] Obtain explicit owner approval before production configuration, store submission, or publication.

## Not done yet

No developer account has been enrolled or paid for; no native build has been tested on a device; no database migration or production change was made; no app was uploaded to either store.
