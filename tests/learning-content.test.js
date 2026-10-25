import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import content from '../learning-content.cjs';
import { renderLinkedText, renderBreadcrumbs, renderSeoPage } from '../backend/seo-pages.js';

const expected = {
    learn: ['meet-the-table', 'your-five-moves', 'read-the-dealer', 'soft-hands-and-pairs', 'think-in-decisions'],
    glossary: ['ace', 'bankroll', 'basic-strategy', 'blackjack', 'bust', 'dealer-upcard', 'double-down', 'das', 'hard-hand', 'hit', 'hole-card', 'house-edge', 'insurance', 'late-surrender', 'natural', 'push', 'resplit', 's17', 'shoe', 'soft-hand', 'split', 'stand', 'ten-value-card'],
    charts: ['hard', 'soft', 'pair'],
};
const links = parts => parts.filter(part => part.href);
const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('stable paths and every related/phrase target resolve without duplicates or self-links', () => {
    assert.deepEqual(Object.keys(content.topics), Object.entries(expected).flatMap(([section, slugs]) => slugs.map(slug => `${section}/${slug}`)));
    const phrases = new Set();
    for (const [path, topic] of Object.entries(content.topics)) {
        assert.equal(path.split('/')[1], topic.slug);
        assert.ok(topic.related.length >= 3 && topic.related.length <= 5, path);
        assert.equal(new Set(topic.related).size, topic.related.length);
        for (const related of topic.related) {
            assert.ok(content.topics[related], related);
            assert.notEqual(related, path);
        }
        if (!path.startsWith('glossary/')) continue;
        assert.ok(topic.linkTerms.length);
        for (const phrase of topic.linkTerms) {
            assert.ok(phrase.trim());
            assert.ok(!phrases.has(phrase.toLowerCase()), phrase);
            phrases.add(phrase.toLowerCase());
            assert.deepEqual(links(content.linkify(phrase)).map(part => part.href), [`/${path}`]);
        }
    }
});

test('case and whole-word matching preserve exact original text, including Unicode boundaries', () => {
    const text = 'İ hello ACE, aces; acebook, disgrace, éace, aceé, 𐐀ace, ace_1. Soft HANDS & "soft hand". Double Down!';
    const parts = content.linkify(text);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.deepEqual(links(parts), [
        { text: 'ACE', href: '/glossary/ace' },
        { text: 'Soft HANDS', href: '/glossary/soft-hand' },
        { text: 'Double Down', href: '/glossary/double-down' },
    ]);
    assert.deepEqual(links(content.linkify('acebook disgrace éace aceé 𐐀ace ace_1')), []);
});

test('first mention uses the longest phrase and tracks synonyms across paragraphs', () => {
    const state = content.createLinkState();
    assert.deepEqual(links(content.linkify('Natural blackjack, blackjack, NATURAL.', state)).map(part => part.href), ['/glossary/natural', '/glossary/blackjack']);
    assert.deepEqual(links(content.linkify('Blackjack, natural blackjack, ace; aces.', state)), [{ text: 'ace', href: '/glossary/ace' }]);
});

test('zero, glossary and topic caps span calls and exclude the current topic', () => {
    for (const cap of [0, 2, 5]) {
        const state = content.createLinkState('glossary/ace', cap);
        const parts = [...content.linkify('ace, hit, stand, split.', state), ...content.linkify('double down, surrender, insurance, blackjack.', state)];
        assert.equal(links(parts).length, cap);
        assert.ok(!links(parts).some(part => part.href === '/glossary/ace'));
        assert.equal(state.remaining, 0);
    }
    assert.deepEqual(links(content.linkify('natural blackjack and natural', content.createLinkState('glossary/natural'))), []);
});

test('mentions beyond one card cap are not linked again on later cards', () => {
    const seen = new Set();
    assert.equal(links(content.linkify('ace, hit, split', content.createLinkState('', 2, seen))).length, 2);
    assert.deepEqual(links(content.linkify('split again', content.createLinkState('', 2, seen))), []);
});

test('shared page state reserves the top article links before interactive cards', () => {
    for (const [path, topic] of Object.entries(content.topics)) {
        const state = content.createPageLinkState(path);
        const topState = content.createLinkState(path);
        const topLinks = links([...content.linkify(topic.body, topState), ...content.linkify(content.topicTip(topic), topState)]);
        assert.equal(state.remaining, 5 - topLinks.length);
        assert.deepEqual(state.seen, topState.seen);
        assert.deepEqual(links(content.linkify(topic.body, state)), []);
    }
});

test('server escapes content and link text rather than interpreting HTML', () => {
    const text = '<img src=x onerror="bad()"> & "ACE" </script>';
    assert.equal(renderLinkedText(text), '&lt;img src=x onerror=&quot;bad()&quot;> &amp; &quot;<a class="in-text-link" href="/glossary/ace">ACE</a>&quot; &lt;/script>');
    assert.equal(content.linkify(text).map(part => part.text).join(''), text);
});

test('BreadcrumbList uses Google schema, ordered absolute URLs, and escaped script delimiters', () => {
    for (const path of [...Object.keys(content.sections), ...Object.keys(content.topics)]) {
        const { markup, json } = renderBreadcrumbs(path);
        const data = JSON.parse(json);
        assert.equal(data['@context'], 'https://schema.org');
        assert.equal(data['@type'], 'BreadcrumbList');
        const crumbs = content.breadcrumbs(path);
        assert.equal(data.itemListElement.length, content.topics[path] ? 3 : 2);
        assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
        assert.equal((markup.match(/<a /g) || []).length, crumbs.length - 1);
        data.itemListElement.forEach((item, index) => {
            assert.deepEqual(item, { '@type': 'ListItem', position: index + 1, name: crumbs[index].title, item: `https://blackjack-trainer.co${crumbs[index].href}` });
        });
    }
    const topic = content.topics['learn/meet-the-table'];
    const title = topic.title;
    try {
        topic.title = '</script><img src=x> & "Ace"';
        const { markup, json } = renderBreadcrumbs(topic.path);
        assert.ok(!json.includes('<'));
        assert.ok(!markup.includes('<img'));
        assert.equal(JSON.parse(json).itemListElement[2].name, topic.title);
    } finally {
        topic.title = title;
    }
});

test('every rendered topic has unique in-text targets, no self-link and a five-link cap', () => {
    for (const path of Object.keys(content.topics)) {
        const html = renderSeoPage(template, path);
        assert.deepEqual(JSON.parse(html.match(/<script id="breadcrumbData"[^>]*>(.*?)<\/script>/s)[1]), JSON.parse(renderBreadcrumbs(path).json));
        const targets = [...html.matchAll(/class="in-text-link" href="([^"]+)"/g)].map(match => match[1]);
        assert.ok(targets.length <= 5, path);
        assert.equal(new Set(targets).size, targets.length, path);
        assert.ok(!targets.includes(`/${path}`), path);
        assert.ok(html.indexOf(`id="${path.split('/')[0]}Content"`) < html.indexOf('data-related-topics'));
    }
    for (const section of Object.keys(content.sections)) {
        const html = renderSeoPage(template, section);
        const cards = html.match(/<article>[\s\S]*?<\/article>/g);
        const seen = new Set();
        for (const card of cards) {
            const targets = [...card.matchAll(/class="in-text-link" href="([^"]+)"/g)].map(match => match[1]);
            assert.ok(targets.length <= (section === 'glossary' ? 2 : 5));
            targets.forEach(target => { assert.ok(!seen.has(target)); seen.add(target); });
        }
    }
});

test('privacy SEO page exposes its content without client-side navigation', () => {
    const html = renderSeoPage(template, 'privacy');
    const main = html.match(/<main id="placeholderPages"[^>]*>/)?.[0];
    const privacy = html.match(/<section[^>]*data-placeholder-content="privacy"[^>]*>/)?.[0];
    assert.ok(main);
    assert.ok(privacy);
    assert.doesNotMatch(main, /\shidden\b/);
    assert.doesNotMatch(privacy, /\shidden\b/);
    assert.match(html, /<h1 id="privacyHeading"/);
});
