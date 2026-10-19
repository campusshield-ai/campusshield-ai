# ShieldMind study companion and planner — staging only

## Included
- Academic Q&A, structured study-note prompts, practice quizzes and revision-plan prompts through the signed-in `shieldmind-chat` Edge Function.
- Optional JPG/PNG/WebP academic study images up to 2.5 MB. Image data is sent to OpenAI for processing and not saved in CampusShield Storage. Server-side RPC monthly usage caps apply.
- Private timetable entries synchronized in `public.shieldmind_planner_items`, protected by own-row RLS.
- Browser reminders can notify while the app is open and permission is granted. Background push notifications are not configured.
- Per-minute/daily request caps plus the eight-hour session and one-hour cooldown are enforced server-side in staging.

## Monthly plan concept
| Tier | Price | Requests/min | Requests/UTC day | Image allowance |
|---|---:|---:|---:|---:|
| Free | ₦0 | 5 | 80 | 0 |
| Starter | ₦2,000 | 10 | 250 | 20/month |
| Plus | ₦5,000 | 15 | 700 | 60/month |
| Pro | ₦10,000 | 25 | 1,500 | 150/month |
| Ultra | ₦15,000 | 35 | 2,500 | 300/month |
| Max | ₦28,000 | 50 | 4,000 | 600/month |

Paid plans are prepaid for 30 days and do not auto-renew. Core safety and incident reporting remain free. Paystack needs a test secret in Supabase Edge Function secrets; GitHub repository secrets are separate.

## Privacy and release checks
- Use fictional staging accounts and academic-only images.
- Never upload IDs, incidents, attendance, private Helpdesk cases, passwords, medical documents or personal information.
- No approved official campus source catalog is connected, so ShieldMind responses are not official university policy.
- Test own-row planner RLS, free-plan image rejection, image monthly caps, message quotas, the 8-hour/1-hour session cycle, signed Paystack callbacks, expiration and duplicate webhook handling.
- Keep production unchanged. Do not merge or publicly release without explicit owner approval.


All timetable planner RPCs also verify a verified profile, active verified campus membership, and approved student identity for student accounts at the database layer. The browser gate is not the security boundary.
