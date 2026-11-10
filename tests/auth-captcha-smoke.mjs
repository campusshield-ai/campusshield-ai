import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const config = read('../supabase-config.js');
const backend = read('../campusshield-backend.js');
const app = read('../campusshield-app.js');
const html = read('../index.html');

const productionStart = config.indexOf('const production = {');
const stagingStart = config.indexOf('const staging = {');
assert.ok(productionStart >= 0 && stagingStart > productionStart, 'Supabase production and staging configs must remain explicit');
const productionConfig = config.slice(productionStart, stagingStart);
const stagingConfig = config.slice(stagingStart, config.indexOf('window.CAMPUSSHIELD_SUPABASE_CONFIG'));
assert.doesNotMatch(productionConfig, /captcha\s*:/, 'This staging-only patch must not change production CAPTCHA settings');
assert.match(stagingConfig, /enabled:\s*true/);
assert.match(stagingConfig, /provider:\s*["']turnstile["']/);
assert.match(stagingConfig, /siteKey:\s*["']0x4AAAAAAF6tOY7MqWYcC3h8["']/);
assert.doesNotMatch(config, /secretKey|secret:\s*["']/i, 'A CAPTCHA secret must never be shipped to browser code');

assert.match(backend, /async signIn\(email, password, captchaToken\)/);
assert.match(backend, /signInWithPassword\([\s\S]*?options:\s*\{\s*captchaToken\s*\}/);
assert.match(backend, /async signUp\([\s\S]*?captchaToken\)/);
assert.match(backend, /options:\s*\{[\s\S]*?\.\.\.\(captchaToken \? \{ captchaToken \} : \{\}\),\s*data:/);
assert.match(backend, /async requestPasswordReset\(email, redirectTo, captchaToken\)/);
assert.match(backend, /resetPasswordForEmail\([\s\S]*?\.\.\.\(captchaToken \? \{ captchaToken \} : \{\}\)/);
assert.match(backend, /async resendConfirmation\(email, captchaToken\)/);
assert.match(backend, /emailRedirectTo: getAuthRedirectUrl\(\),\s*\.\.\.\(captchaToken \? \{ captchaToken \} : \{\}\)/);

assert.match(app, /window\.turnstile\?\.render/);
assert.match(app, /'expired-callback'/);
assert.match(app, /'error-callback'/);
assert.match(app, /function requireAuthCaptchaToken\(/);
assert.match(app, /backend\.signIn\(email, password, captchaToken\)/);
assert.match(app, /backend\.signUp\(email, password, name, username, universityId, profileData, captchaToken\)/);
assert.match(app, /backend\.requestPasswordReset\(email, redirectUrl, captchaToken\)/);
assert.match(app, /backend\.resendConfirmation\(email, captchaToken\)/);
assert.match(app, /\.finally\(resetAuthCaptcha\)/, 'single-use challenges must be reset after protected requests');

assert.match(html, /id="auth-captcha-field"/);
assert.match(html, /id="auth-captcha"/);
assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);

console.log('CampusShield Auth CAPTCHA checks passed: staging-only Turnstile, protected Auth calls, token expiry/reset, no browser secret.');
