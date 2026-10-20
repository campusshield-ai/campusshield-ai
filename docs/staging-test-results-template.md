# CampusShield AI — Staging Test Results

Use only fictional accounts and dummy files in the staging environment. Do not include names, email addresses, student/staff numbers, passwords, tokens, signed URLs, or document contents.

## Test session

- Date/time:
- Browser/device:
- Staging URL:
- Tester role(s) used (role labels only):
- Commit/branch tested:
- Supabase project ref confirmed as staging: `hywcpnoqqhxvujnimhxl` (yes/no)

## Results

| Test ID | Result (Pass / Fail / Blocked) | Non-sensitive observation |
|---|---|---|
| A1 Student registration | Blocked | |
| A2 Student academic details save | Blocked | |
| A3 Staff registration | Blocked | |
| A4 Pending account restriction | Blocked | |
| A5 Direct request cannot bypass authorization | Blocked | |
| B1 Pending student ID submission | Blocked | |
| B2 Private document access | Blocked | |
| B3 Same-university review | Blocked | |
| B4 Cross-university review denied | Blocked | |
| B5 Approval/rejection state transitions | Blocked | |
| C1 Staff document submission | Blocked | |
| C2 Same-university staff review | Blocked | |
| C3 Cross-university staff access denied | Blocked | |
| C4 Evidence audit history | Blocked | |
| D1 Platform admin appointment workflow | Blocked | |
| D2 Campus admin scope limited to one university | Blocked | |
| E1 Anonymous protected RPC access denied | Blocked | |
| E2 Direct audit-table access denied | Blocked | |
| E3 Invalid/oversized document rejected | Blocked | |
| F1 University search/request flow | Blocked | |
| F2 Verified-only community/helpdesk gates | Blocked | |

## Issues found

For each failure, include only:
- Test ID
- Expected behavior
- Actual behavior
- Approximate time
- Screenshot with all personal information and browser secrets obscured

Do not paste access tokens, API keys, session cookies, signed file URLs, real identity details, or document contents.

## Exit decision

- [ ] All required tests passed.
- [ ] All failures have been fixed and retested.
- [ ] Security Advisor findings reviewed individually.
- [ ] Leaked-password protection confirmed in Supabase Auth.
- [ ] Test accounts and dummy files cleaned up.
- [ ] Project owner explicitly approved release.

**Do not treat “Blocked” as “Pass.” Do not merge or deploy based only on automated smoke checks.**
