import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { sections, extractContent, validateContent, applyContent, safeLink, safeImage } from '../section-content.js';
import { supabaseUrl } from '../supabase-config.js';
import { StagedImages } from '../staged-images.js';
import { cleanupImages, sweepImages, imagePrefix } from '../image-storage.js';
const html = await readFile('index.html', 'utf8');
const defaults = JSON.parse(await readFile('data/site-content.json', 'utf8'));
test('trying, replacing and discarding images only manages browser memory', () => {
  const revoked = []; let count = 0;
  const staged = new StagedImages({ createObjectURL: () => `blob:preview-${++count}`, revokeObjectURL: url => revoked.push(url) });
  staged.set('hero', new Blob(['first']));
  staged.set('hero', new Blob(['second']));
  assert.deepEqual(revoked, ['blob:preview-1']);
  assert.equal(staged.get('hero').previewUrl, 'blob:preview-2');
  staged.remove('hero');
  assert.equal(staged.items.size, 0);
  staged.set('gallery', new Blob(['third'])); staged.clear();
  assert.deepEqual(revoked, ['blob:preview-1', 'blob:preview-2', 'blob:preview-3']);
});
test('cleanup preserves originals and images used in any section', async () => {
  const removed = [];
  const api = async (path, options) => {
    if (path.startsWith('/rest/')) return [{ content: { hero_image: imagePrefix + 'hero/shared.webp' } }, { content: { photo1_image: imagePrefix + 'gallery/active.webp' } }];
    removed.push(...JSON.parse(options.body).prefixes); return removed;
  };
  const result = await cleanupImages(api, ['assets/photo-49.jpg', imagePrefix + 'hero/shared.webp', imagePrefix + 'gallery/active.webp', imagePrefix + 'hero/old.webp', imagePrefix + '../bad.webp']);
  assert.deepEqual(removed, ['hero/old.webp']);
  assert.equal(result.failed, false);
  assert.equal((await cleanupImages(async () => { throw Error('offline'); }, [imagePrefix + 'hero/old.webp'])).failed, true);
});
test('orphan sweep waits an hour, handles pagination and rechecks references', async () => {
  const removed = [], now = Date.parse('2026-11-17T12:00:00Z');
  const api = async (path, options) => {
    if (path.startsWith('/rest/')) return [{ content: { active: imagePrefix + 'hero/active.webp' } }];
    if (path.includes('/list/')) {
      const { offset } = JSON.parse(options.body);
      if (offset === 100) return [{ id: 'end', name: 'last.webp', created_at: '2026-11-17T09:00:00Z' }];
      return Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: i === 0 ? 'active.webp' : i === 1 ? 'recent.webp' : `old-${i}.webp`, created_at: i === 1 ? '2026-11-17T11:45:00Z' : '2026-11-17T09:00:00Z' }));
    }
    const batch = JSON.parse(options.body).prefixes; removed.push(...batch); return batch;
  };
  assert.equal((await sweepImages(api, ['hero'], now)).failed, false);
  assert.equal(removed.length, 99);
  assert.ok(!removed.includes('hero/active.webp')); assert.ok(!removed.includes('hero/recent.webp'));
  assert.ok(removed.includes('hero/last.webp'));
});
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
