# CampusShield AI 🛡️

### Campus Safety Incident Reporting Prototype

**CampusShield AI** is a campus safety prototype for submitting and reviewing incident reports. It does not provide emergency dispatch or response services.

🌐 **Live Website:** https://campusshield-ai.github.io/campusshield-ai/

## 🚀 Project Overview

CampusShield AI helps campus communities record safety concerns and review incident information available to their signed-in accounts.

The project is being developed with Nigerian university campuses in mind.

## ✨ Current Features

- **Incident reporting** — Submit categorized reports to the configured Supabase project.
- **Incident management** — Search and filter records visible to the signed-in account; verified security and administrator accounts can mark reports resolved when database policies permit it.
- **Dashboard statistics** — Counts and recent reports are calculated from loaded Supabase records available to the account.
- **Account verification** — Student and teacher access is subject to administrator review.
- **Illustrative triage calculator** — A rule-based guide for human review, not a validated model, probability, or prediction.
- **Responsive workspace** — Layout adapts to desktop, tablet, and phone screens.
- **PWA install setup** — Android browsers can offer installation when their browser criteria are met; iPhone and iPad users can add CampusShield from Safari’s Share menu.

The current app does not include an interactive campus map. Map-based views remain a future feature.

## 🎯 Our Mission

To develop accessible technology that helps universities identify safety concerns, organize incident information, and make more informed campus safety decisions.

## 🛠️ Technology

- HTML
- CSS
- JavaScript
- Supabase Auth and PostgreSQL
- GitHub Pages hosting

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

## 🔮 Future Plans

- Interactive campus map
- Improved incident reporting and categorization
- Advanced analytics and trend visualization
- Risk monitoring and alert features
- Administrative dashboard improvements
- Stronger privacy and security controls

## 👥 Team

Built by the CampusShield AI project team.

## 🤝 Contributions

Suggestions, feedback, and collaboration that improve campus safety technology are welcome.

## 📄 Disclaimer

CampusShield AI is a technology development project. Any risk indicators or analytics are intended to support assessment and should not be treated as confirmed predictions of criminal activity or emergencies.

---

**CampusShield AI — Building Safer Campuses Through Technology.**
