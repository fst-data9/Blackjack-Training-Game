import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readAdSenseConfig } from '../backend/adsense-config.js';
import { adSenseNonce, contentSecurityDirectives, withScriptNonce } from '../backend/content-security-policy.js';
import helmet from '../backend/node_modules/helmet/index.mjs';
import { renderSeoPage } from '../backend/seo-pages.js';

const names = {
    'learning-end': 'ADSENSE_LEARNING_SLOT_ID',
    'learning-incontent': 'ADSENSE_LEARNING_INCONTENT_SLOT_ID',
    'game-below-stats': 'ADSENSE_GAME_SLOT_ID',
    'review-summary': 'ADSENSE_REVIEW_SLOT_ID',
};
const publisher = 'ca-pub-0000000000000000';

test('ads remain disabled even with valid identifiers and attempted activation settings', () => {
    const env = { ADSENSE_PUBLISHER_ID: publisher, ADSENSE_ENABLED: 'true' };
    Object.values(names).forEach((name, index) => { env[name] = String(index + 1).repeat(10); });
    assert.deepEqual(readAdSenseConfig(env), { enabled: false, publisher, slots: Object.fromEntries(Object.keys(names).map((key, index) => [key, String(index + 1).repeat(10)])) });
});

test('all four slots and the publisher are optional, including independently missing slots', () => {
    assert.deepEqual(readAdSenseConfig({}), { enabled: false, publisher: '', slots: Object.fromEntries(Object.keys(names).map(key => [key, ''])) });
    for (const [placement, name] of Object.entries(names)) {
        const config = readAdSenseConfig({ [name]: '0123456789' });
        assert.equal(config.slots[placement], '0123456789');
        assert.equal(Object.values(config.slots).filter(Boolean).length, 1);
    }
});

test('invalid identifiers fail with setting names and do not expose their values', () => {
    for (const name of Object.values(names)) {
        for (const value of ['123456789', '12345678901', '01234abcde', ' 0123456789', '0123456789\n', 'private-invalid-value']) {
            assert.throws(() => readAdSenseConfig({ [name]: value }), error => error.message === `${name} must contain 10 digits`);
        }
    }
    assert.throws(() => readAdSenseConfig({ ADSENSE_PUBLISHER_ID: 'private-invalid-value' }), /ADSENSE_PUBLISHER_ID must/);
});

function header(enabled, production = false, nonce = 'nonce-for-test') {
    let result;
    helmet.contentSecurityPolicy({ directives: contentSecurityDirectives({ enabled }, production) })({}, {
        locals: { adSenseNonce: nonce }, setHeader: (_name, value) => { result = value; },
    }, () => {});
    return result;
}

test('disabled CSP preserves all current restrictions and admits no advertising origins', () => {
    const disabled = header(false);
    assert.equal(disabled, "default-src 'self';base-uri 'self';font-src 'self' data:;form-action 'self';frame-ancestors 'none';img-src 'self' data: https://*.googleusercontent.com;object-src 'none';script-src 'self' https://accounts.google.com https://challenges.cloudflare.com https://static.cloudflareinsights.com/beacon.min.js;script-src-attr 'none';style-src 'self' 'unsafe-inline' https://accounts.google.com;connect-src 'self' https://accounts.google.com https://challenges.cloudflare.com https://cloudflareinsights.com/cdn-cgi/rum;frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com");
    assert.doesNotMatch(disabled, /fundingchoices|googlesyndication|doubleclick|googleadservices|nonce-|strict-dynamic|unsafe-eval/);
    assert.equal(adSenseNonce({ enabled: false }), undefined);
    assert.ok(header(false, true).includes('upgrade-insecure-requests'));
});

test('enabled CSP follows Google strict nonce guidance and allows HTTPS ad resources', () => {
    const enabled = header(true);
    assert.match(enabled, /script-src 'nonce-nonce-for-test' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http:/);
    for (const directive of ['connect-src', 'frame-src', 'img-src']) {
        assert.ok(enabled.match(new RegExp(`${directive} ([^;]+)`))[1].split(' ').includes('https:'));
    }
    for (const directive of ['script-src', 'connect-src', 'frame-src', 'img-src', 'style-src']) {
        const sources = enabled.match(new RegExp(`${directive} ([^;]+)`))[1].split(' ');
        assert.ok(sources.includes('https://fundingchoicesmessages.google.com'));
        assert.ok(sources.includes('https://fundingchoices.google.com'));
    }
    assert.match(enabled, /object-src 'none'/);
    assert.match(enabled, /script-src-attr 'none'/);
    const nonce = adSenseNonce({ enabled: true });
    assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
    assert.notEqual(nonce, adSenseNonce({ enabled: true }));
});

test('all trusted scripts, including learning JSON-LD, receive the response nonce only when enabled', () => {
    const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const html of [template, renderSeoPage(template, 'learn/meet-the-table')]) {
        assert.equal(withScriptNonce(html), html);
        const tagged = withScriptNonce(html, 'test-nonce');
        const scripts = tagged.match(/<script\b[^>]*>/g);
        assert.ok(scripts.length >= 7);
        assert.ok(scripts.every(script => script.includes('nonce="test-nonce"')));
        assert.equal(tagged.replaceAll(' nonce="test-nonce"', ''), html);
    }
});
