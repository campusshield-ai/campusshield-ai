import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const backend = await readFile(new URL('../campusshield-backend.js', import.meta.url), 'utf8');
const identityAddon = await readFile(new URL('../campusshield-backend-identity-addon.js', import.meta.url), 'utf8');

function includes(source, value, message = value) {
  assert.ok(source.includes(value), 'Expected source to include: ' + message);
}

// Dashboard structure and navigation links.
for (const id of [
  'dashboard-previews-status',
  'dashboard-notices-preview',
  'dashboard-events-preview',
  'dashboard-community-preview',
  'dashboard-helpdesk-preview',
  'refresh-dashboard-previews'
]) includes(html, 'id="' + id + '"');
for (const page of ['noticeboard', 'events', 'community', 'helpdesk']) {
  includes(html, 'data-page="' + page + '"', 'preview link to ' + page);
}

// Pending and unverified accounts must fail closed before any preview fetches.
includes(html, "profileAtStart.verification_status !== 'verified'");
includes(html, "identity?.status !== 'approved'");
includes(html, '!hasVerifiedCampusStaffMembership()');
includes(html, '!campus?.university_id || !user?.id');
includes(html, "clearDashboardCampusPreviews('Sign in to load your campus previews.')");

// Async work must not paint data after sign-out or account/session switching.
includes(html, 'requestSessionVersion === authSessionVersion');
includes(html, 'currentProfile === profileAtStart');
includes(html, "if (event === 'SIGNED_OUT') {");
includes(html, 'authSessionVersion += 1;');
includes(html, 'currentProfile = null;');
includes(html, 'campusContext = null;');

// Feed failures are isolated and empty states are explicit.
includes(html, 'Promise.allSettled([');
for (const state of [
  'Notices are temporarily unavailable.',
  'Events are temporarily unavailable.',
  'CampusPulse is temporarily unavailable.',
  'Helpdesk summary is temporarily unavailable.',
  'No active official notices yet.',
  'No upcoming approved events yet.',
  'No published CampusPulse posts yet.',
  'You have no Helpdesk requests yet.'
]) includes(html, state);

// Helpdesk preview may render only the signed-in user's own requests.
includes(html, 'ticket.created_by === user.id');
includes(html, "ownTickets.length + ' request(s) submitted'");
includes(html, 'esc(title || \'Untitled\')');
includes(html, 'esc(String(detail).slice(0, 180))');

// Dashboard preview is campus-wide only. Full noticeboard applies audience and expiry filters.
includes(html, "return notice.audience_scope === 'campus'");
includes(html, "scope === 'faculty'");
includes(html, "scope === 'department'");
includes(html, "normalizeAudience(notice.target_faculty) === normalizeAudience(audienceProfile?.faculty)");
includes(html, "normalizeAudience(notice.target_department) === normalizeAudience(audienceProfile?.department)");
includes(html, 'Number.isFinite(expiryTime) && expiryTime > Date.now()');
includes(html, "if (error) throw error;", 'notice audience profile lookup fails closed');

// Expected backend methods exist and continue using existing RLS-scoped queries.
for (const method of [
  'listCampusNotices',
  'listCampusEvents',
  'listCommunityPosts',
  'listCampusHelpdeskTickets',
  'getMyCampusContext',
  'getCurrentUser',
  'getMyStudentIdentityVerification'
]) {
  if (method === 'getMyStudentIdentityVerification') includes(identityAddon, 'backend.getMyStudentIdentityVerification = async function');
  else includes(backend, 'async ' + method + '(');
}

// All literal navigation keys have a matching page section; literal IDs are unique.
const navKeys = [...new Set([...html.matchAll(/data-page=["']([^"'\x60]+)["']/g)].map(match => match[1]).filter(value => !value.includes('${')))];
const pageKeys = new Set([...html.matchAll(/id=["']page-([^"'\x60]+)["']/g)].map(match => match[1]).filter(value => !value.includes('${')));
for (const key of navKeys) assert.ok(pageKeys.has(key), 'Missing page section for navigation key: ' + key);
const ids = [...html.matchAll(/\bid=["']([^"'\x60]+)["']/g)].map(match => match[1]).filter(value => !value.includes('${'));
const seen = new Set();
for (const id of ids) {
  assert.ok(!seen.has(id), 'Duplicate literal HTML id: ' + id);
  seen.add(id);
}

console.log('Dashboard live-preview static smoke checks passed.');
