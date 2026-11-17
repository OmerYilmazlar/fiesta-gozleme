import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { sections, extractContent, validateContent, applyContent, safeLink, safeImage } from '../section-content.js';
import { supabaseUrl } from '../supabase-config.js';
const html = await readFile('index.html', 'utf8');
const defaults = JSON.parse(await readFile('data/site-content.json', 'utf8'));
test('all eleven sections have valid targets and defaults matching the site', () => {
  const { document } = parseHTML(html);
  assert.equal(sections.length, 11);
  for (const s of sections) {
    assert.deepEqual(defaults[s.id], extractContent(document, s));
    validateContent(s, defaults[s.id]);
    applyContent(document, s, defaults[s.id]);
    assert.deepEqual(extractContent(document, s), defaults[s.id]);
  }
  assert.ok(document.querySelector('.announcement-socials svg'));
  assert.ok(document.querySelector('.hero .button span'));
  assert.ok(document.querySelector('.hero h1 em'));
  assert.equal(document.querySelectorAll('.market-card').length, 10);
});
test('content editing preserves formatting, controls and treats HTML as plain text', () => {
  const { document } = parseHTML(html);
  const hero = sections.find(s => s.id === 'hero');
  applyContent(document, hero, { heading: 'Hot.\nFresh.\nMade for you.', intro: '<img src=x onerror=alert(1)>', primary_text: 'Explore our menu', primary_link: '#menu' });
  assert.equal(document.querySelector('.hero h1 em').textContent, 'Made for you.');
  assert.equal(document.querySelectorAll('.hero h1 br').length, 2);
  assert.equal(document.querySelector('.hero .lead img'), null);
  assert.match(document.querySelector('.hero .lead').textContent, /<img/);
  assert.ok(document.querySelector('.hero .button span'));
  assert.equal(document.querySelector('.hero .button').getAttribute('href'), '#menu');
  assert.equal(document.querySelectorAll('#instagram-posts').length, 1);
});
test('unsafe URLs and markup sources are rejected before any mutation', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'https://user:password@example.com', 'https:\\evil.com', 'java\nscript:alert(1)']) assert.equal(safeLink(url), false, url);
  for (const url of ['#menu', 'https://example.com/path', 'mailto:hello@example.com', 'tel:+447548298372']) assert.equal(safeLink(url), true, url);
  for (const url of ['assets/../password.png', 'data:image/svg+xml,x', 'https://evil.example/photo.jpg', `${supabaseUrl}/storage/v1/object/public/site-images/../../evil.webp`]) assert.equal(safeImage(url), false, url);
  assert.ok(safeImage('assets/photo-49.jpg'));
  assert.ok(safeImage(`${supabaseUrl}/storage/v1/object/public/site-images/hero/abcd-123.webp`));
  const { document } = parseHTML(html), before = document.querySelector('.hero h1').textContent;
  assert.throws(() => applyContent(document, sections.find(s => s.id === 'hero'), { heading: 'Changed', primary_link: 'javascript:alert(1)' }));
  assert.equal(document.querySelector('.hero h1').textContent, before);
});
test('editor controls are separate from market editing and preview cannot execute scripts', async () => {
  const { document } = parseHTML(await readFile('admin.html', 'utf8'));
  assert.ok(document.querySelector('#market-workspace #editor'));
  assert.ok(document.querySelector('#content-workspace #section-form'));
  assert.equal(document.querySelector('#section-preview').getAttribute('sandbox'), 'allow-same-origin');
  assert.equal(document.querySelectorAll('form form').length, 0);
});
