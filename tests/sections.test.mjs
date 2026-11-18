import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { sections, extractContent, validateContent, applyContent, safeLink, safeImage } from '../section-content.js';
import { supabaseUrl } from '../supabase-config.js';
import { StagedImages } from '../staged-images.js';
import { createSectionEditor } from '../admin-sections.js';
import { createLayoutEditor } from '../admin-layout.js';
import { defaultOrder, validateOrder, applyOrder } from '../site-layout.js';
import { cleanupImages, sweepImages, imagePrefix } from '../image-storage.js';
const html = await readFile('index.html', 'utf8');
const defaults = JSON.parse(await readFile('data/site-content.json', 'utf8'));

test('layouts move existing sections without losing content or controls and reject fixed/duplicate entries', () => {
  const { document } = parseHTML(html), market = document.querySelector('#markets'), hero = document.querySelector('.hero');
  const reordered = [...defaultOrder].reverse();
  applyOrder(document, reordered);
  assert.deepEqual([...document.querySelector('#main').children].filter(n => defaultOrder.includes(n.id)).map(n => n.id), reordered);
  assert.equal(document.querySelector('#markets'), market); assert.equal(document.querySelector('#main').firstElementChild, hero);
  assert.ok(document.querySelector('#menu .sides')); assert.equal(document.querySelectorAll('#instagram-posts').length, 1);
  for (const invalid of [null, ['header', ...defaultOrder.slice(1)], ['menu', ...defaultOrder.slice(0, -1)], defaultOrder.slice(1)]) {
    assert.throws(() => validateOrder(invalid)); assert.throws(() => applyOrder(document, invalid));
  }
  applyOrder(document, defaultOrder); assert.equal(document.querySelector('#menu').nextElementSibling, market);
});

test('layout panel previews, publishes, reloads, resets and handles conflicts without losing edits', async () => {
  const { document } = parseHTML(await readFile('admin.html', 'utf8'));
  const prior = globalThis.document; globalThis.document = document;
  let row = { id: 'layout', content: { order: [...defaultOrder] }, updated_at: '2026-11-18T00:00:00Z' };
  let message, lastOrder, conflict = false, calls = 0;
  try {
    document.querySelector('#workspace').hidden = false; document.querySelector('#content-workspace').hidden = false;
    const editor = createLayoutEditor({ status: text => { message = text; }, onBusy() {}, onChange: order => { lastOrder = order; }, api: async (path, options) => {
      assert.match(path, /id=eq.layout&updated_at=eq./); calls++;
      if (conflict) return [];
      row = { ...row, content: JSON.parse(options.body).content, updated_at: '2026-11-18T01:00:00Z' }; return [row];
    } });
    editor.load([row]); assert.equal(editor.hasChanges(), false);
    assert.equal(document.querySelector('#layout-list button').disabled, true);
    const down = () => document.querySelector('#layout-list button[data-section="menu"][data-direction="1"]').click();
    down(); assert.equal(editor.hasChanges(), true); assert.equal(lastOrder[0], 'markets'); assert.equal(calls, 0);
    document.querySelector('#layout-discard').click(); assert.equal(editor.hasChanges(), false);
    down(); await document.querySelector('#layout-form').onsubmit({ preventDefault() {} });
    assert.match(message, /published/); assert.equal(editor.hasChanges(), false);
    editor.clear(); editor.load([row]); assert.equal(editor.getOrder()[0], 'markets');
    document.querySelector('#layout-reset').click(); assert.equal(editor.hasChanges(), true); assert.deepEqual(lastOrder, defaultOrder);
    conflict = true; await document.querySelector('#layout-form').onsubmit({ preventDefault() {} });
    assert.match(message, /Another editor/); assert.equal(editor.hasChanges(), true); assert.equal(editor.isBusy(), false);
    document.querySelector('#layout-discard').click(); assert.equal(editor.hasChanges(), false); assert.equal(editor.getOrder()[0], 'markets');
  } finally { globalThis.document = prior; }
});

test('gift card editor loads, previews, publishes, reopens and preserves unsaved edits on conflicts', async () => {
  const { document, window } = parseHTML(await readFile('admin.html', 'utf8'));
  const globals = { document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval, confirm: globalThis.confirm, createImageBitmap: globalThis.createImageBitmap };
  const previewDoc = parseHTML(html).document;
  let message = '', conflict = false, patches = 0;
  const uploaded = [], deleted = [];
  let rows = sections.map(s => ({ id: s.id, content: {}, updated_at: '2026-11-18T00:00:00Z' }));
  try {
    globalThis.document = document;
    globalThis.fetch = async () => ({ ok: true, json: async () => defaults });
    globalThis.setInterval = () => 0;
    globalThis.confirm = () => true;
    globalThis.createImageBitmap = async () => ({ width: 480, height: 853, close() {} });
    const createElement = document.createElement.bind(document);
    document.createElement = name => {
      const node = createElement(name);
      if (name === 'canvas') { node.getContext = () => ({ drawImage() {} }); node.toBlob = cb => cb(new Blob(['prepared-image'], { type: 'image/webp' })); }
      return node;
    };
    document.querySelector('#workspace').hidden = false;
    document.querySelector('#content-workspace').hidden = false;
    const picker = document.querySelector('#section-picker');
    // Linkedom does not implement the browser's select.value setter.
    Object.defineProperty(picker, 'value', { writable: true, value: 'hero' });
    const frame = document.querySelector('#section-preview');
    Object.defineProperty(frame, 'contentDocument', { value: previewDoc });
    Object.defineProperty(frame, 'contentWindow', { value: { scrollY: 0, scrollTo() {} } });
    previewDoc.querySelector('#giftcards').getBoundingClientRect = () => ({ top: 0 });
    const editor = createSectionEditor({ status: value => { message = value; }, api: async (path, options = {}) => {
      if (options.method === 'PATCH') {
        assert.match(path, /id=eq.giftcards&updated_at=eq./); patches++;
        if (conflict) return [];
        const row = { id: 'giftcards', content: JSON.parse(options.body).content, updated_at: '2026-11-18T01:00:00Z' };
        rows = rows.map(r => r.id === row.id ? row : r); return [row];
      }
      if (path.includes('/list/')) return [];
      if (path.startsWith('/storage/v1/object/site-images/') && options.method === 'POST') { uploaded.push(path); return {}; }
      if (path === '/storage/v1/object/site-images' && options.method === 'DELETE') { const paths = JSON.parse(options.body).prefixes; deleted.push(...paths); return paths; }
      if (path.startsWith('/rest/')) return rows;
      throw Error('Unexpected API call: ' + path);
    } });
    await editor.load(); picker.value = 'giftcards'; picker.onchange();
    assert.equal(editor.hasChanges(), false);
    assert.equal(document.querySelector('#section-title').textContent, 'Gift cards');
    frame.dispatchEvent(new window.Event('load'));
    document.querySelector('#layout-list button[data-section="menu"][data-direction="1"]').click();
    assert.equal(editor.hasChanges(), true);
    assert.equal(previewDoc.querySelector('#markets').nextElementSibling.id, 'menu');
    const movableOptions = [...picker.options].map(n => n.value).filter(id => defaultOrder.includes(id));
    assert.equal(movableOptions[0], 'markets');
    document.querySelector('#layout-discard').click(); assert.equal(editor.hasChanges(), false);
    const form = document.querySelector('#section-form');
    const amount = form.querySelector('[data-content-field="amount1"]');
    assert.equal(amount.value, '£20'); amount.value = '£25'; form.oninput();
    assert.equal(editor.hasChanges(), true);
    assert.equal(previewDoc.querySelector('.gift-card-one strong').textContent, '£25');
    amount.value = '£20'; assert.equal(editor.hasChanges(), false); amount.value = '£25';
    await form.onsubmit({ preventDefault() {} });
    assert.match(message, /^Published/); assert.equal(editor.hasChanges(), false);
    assert.equal(rows.find(r => r.id === 'giftcards').content.amount1, '£25');
    picker.value = 'hero'; picker.onchange(); picker.value = 'giftcards'; picker.onchange();
    const savedAmount = form.querySelector('[data-content-field="amount1"]');
    assert.equal(savedAmount.value, '£25'); savedAmount.value = '£30'; conflict = true;
    await form.onsubmit({ preventDefault() {} });
    assert.match(message, /Another editor/); assert.equal(editor.hasChanges(), true); assert.equal(editor.isBusy(), false);
    const destination = form.querySelector('[data-content-field="button_link"]'); destination.value = 'javascript:alert(1)';
    await form.onsubmit({ preventDefault() {} }); assert.equal(patches, 2); assert.match(message, /https/);
    document.querySelector('#section-revert').onclick(); assert.equal(editor.hasChanges(), false);
    conflict = false;
    const imageField = form.querySelector('[data-content-field="artwork_image"]');
    assert.equal(imageField.value, '');
    const imageWrap = imageField.closest('.content-field'), choose = imageWrap.querySelector('[type=file]');
    Object.defineProperty(choose, 'files', { value: [new Blob(['chosen-image'], { type: 'image/png' })] });
    frame.dispatchEvent(new window.Event('load'));
    await choose.onchange();
    assert.equal(uploaded.length, 0); assert.equal(editor.hasChanges(), true);
    assert.match(previewDoc.querySelector('.giftcards-photo').getAttribute('src'), /^blob:/);
    imageWrap.querySelector('button').onclick();
    assert.equal(editor.hasChanges(), false); assert.equal(previewDoc.querySelector('.giftcards-photo').hasAttribute('src'), false);
    await choose.onchange(); await form.onsubmit({ preventDefault() {} });
    assert.equal(uploaded.length, 1); assert.equal(editor.hasChanges(), false);
    assert.match(imageField.value, /site-images\/giftcards\/.+\.webp$/);
    imageWrap.querySelector('button').onclick(); await form.onsubmit({ preventDefault() {} });
    assert.equal(rows.find(r => r.id === 'giftcards').content.artwork_image, '');
    assert.equal(deleted.length, 1); assert.match(deleted[0], /^giftcards\//);
    assert.equal(previewDoc.querySelector('.giftcards-photo').hasAttribute('src'), false);
    assert.equal(imageWrap.querySelector('.image-preview').hidden, true);
    assert.equal(editor.hasChanges(), false);
  } finally { Object.assign(globalThis, globals); }
});
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
test('all twelve sections have valid targets and defaults matching the site', () => {
  const { document } = parseHTML(html);
  assert.equal(sections.length, 12);
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
