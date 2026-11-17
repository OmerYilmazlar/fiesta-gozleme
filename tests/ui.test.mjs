import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { validateFeed, renderFeed, initInstagram } from '../instagram-feed.js';

const html = await readFile('index.html', 'utf8');
const fixture = Array.from({ length: 3 }, (_, i) => ({ id: String(i + 1), caption: 'Gözleme 🥙\nİstanbul\n' + '<img src=x onerror=alert(1)>'.repeat(20),
  timestamp: `2026-11-${17 - i}T12:00:00Z`, permalink: `https://www.instagram.com/p/test_${i}/`,
  mediaType: i === 0 ? 'VIDEO' : i === 1 ? 'CAROUSEL_ALBUM' : 'IMAGE',
  image: `assets/instagram/${i + 1}-${'a'.repeat(24)}.webp`, width: 1080, height: 1350 }));

function setup() {
  const { document, window } = parseHTML(html);
  const section = document.querySelector('#instagram');
  const track = section.querySelector('.instagram-track');
  Object.defineProperty(document, 'baseURI', { value: 'https://example.github.io/fiesta/' });
  Object.defineProperty(track, 'clientWidth', { value: 320, configurable: true });
  Object.defineProperty(track, 'scrollWidth', { value: 960, configurable: true });
  track.scrollLeft = 0;
  window.matchMedia = () => ({ matches: true });
  window.ResizeObserver = class { observe() {} };
  const scrolls = [];
  track.scrollTo = options => { scrolls.push(options); track.scrollLeft = options.left; track.dispatchEvent(new window.Event('scroll')); };
  return { document, window, section, track, scrolls };
}

test('news is immediately above story and preserves original sections, links and navigation', () => {
  const { document } = setup();
  assert.equal(document.querySelector('#instagram').nextElementSibling.id, 'story');
  assert.equal(document.querySelector('.instagram-follow a').getAttribute('href'), 'https://www.instagram.com/fiestagozleme/');
  for (const id of ['menu', 'story', 'markets', 'gallery', 'contact', 'navigation']) assert.ok(document.getElementById(id));
  assert.equal(document.querySelectorAll('.market-card').length, 9);
  assert.ok(document.querySelector('a[href="mailto:fiestagozleme@gmail.com"]'));
  assert.ok(document.querySelector('a[href="tel:+447548298372"]'));
  assert.ok(!html.includes('/_sites/'));
});
test('frontend validates safe paths and sorts; unsafe URLs or duplicates are rejected', () => {
  assert.equal(validateFeed({ version: 1, posts: [...fixture].reverse() })[0].id, '1');
  for (const bad of [{ image: '../secret' }, { permalink: 'javascript:alert(1)' }, { caption: null }, { timestamp: 'bad' }]) {
    assert.throws(() => validateFeed({ version: 1, posts: [{ ...fixture[0], ...bad }] }));
  }
  assert.throws(() => validateFeed({ version: 1, posts: [fixture[0], fixture[0]] }));
});
test('cards preserve plain-text Unicode captions and expand without navigation; media uses project base path', () => {
  const { section, window } = setup();
  renderFeed(section, fixture, 'https://example.github.io/fiesta/', window);
  assert.equal(section.querySelectorAll('.instagram-card').length, 3);
  assert.equal(section.querySelector('img').getAttribute('src'), 'https://example.github.io/fiesta/' + fixture[0].image);
  const button = section.querySelector('.instagram-more');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(section.querySelector('.instagram-caption').textContent, fixture[0].caption);
  assert.equal(section.querySelectorAll('.instagram-caption img').length, 0);
  button.click();
  assert.equal(button.textContent, 'Read more');
  assert.match(section.querySelector('.instagram-badge').textContent, /Video/);
  assert.equal(section.querySelector('time').getAttribute('datetime'), fixture[0].timestamp);
  section.querySelector('img').dispatchEvent(new window.Event('error'));
  assert.ok(section.querySelector('.instagram-media').classList.contains('image-unavailable'));
});
test('carousel controls, keyboard, native swipe scroll updates and reduced motion', () => {
  const { section, track, window, scrolls } = setup();
  renderFeed(section, fixture, 'https://example.github.io/fiesta/', window);
  [...track.children].forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 320 }));
  const previous = section.querySelector('[data-direction="previous"]');
  const next = section.querySelector('[data-direction="next"]');
  const dots = [...section.querySelectorAll('.instagram-dot')];
  assert.equal(dots.length, 3);
  next.click();
  assert.deepEqual(scrolls.at(-1), { left: 320, behavior: 'instant' });
  assert.equal(previous.disabled, false);
  assert.equal(section.querySelector('[role="status"]').textContent, 'Post 2 of 3');
  assert.equal(dots[1].getAttribute('aria-pressed'), 'true');
  const key = new window.Event('keydown', { bubbles: true, cancelable: true }); key.key = 'End';
  track.dispatchEvent(key);
  assert.equal(scrolls.at(-1).left, 640);
  assert.equal(next.disabled, true);
  track.scrollLeft = 0; track.dispatchEvent(new window.Event('scroll'));
  assert.equal(previous.disabled, true);
  assert.equal(section.querySelector('[role="status"]').textContent, 'Post 1 of 3');
  assert.equal(dots[0].getAttribute('aria-pressed'), 'true');
  dots[2].click();
  assert.equal(scrolls.at(-1).left, 640);
  assert.equal(dots[2].getAttribute('aria-pressed'), 'true');
  window.matchMedia = () => ({ matches: false });
  next.click(); assert.equal(scrolls.at(-1).behavior, 'smooth');
  const count = scrolls.length;
  const buttonKey = new window.Event('keydown', { bubbles: true }); buttonKey.key = 'ArrowRight';
  section.querySelector('.instagram-more').dispatchEvent(buttonKey);
  assert.equal(scrolls.length, count);
});
test('no overflow on desktop means no carousel controls', () => {
  const { section, track, window } = setup();
  Object.defineProperty(track, 'clientWidth', { value: 960 });
  renderFeed(section, fixture, 'https://example.com/', window);
  assert.equal(section.querySelector('.instagram-controls').hidden, true);
});
test('slow drags settle to the nearest complete card, including reduced motion', () => {
  const { section, track, window, scrolls } = setup();
  renderFeed(section, fixture, 'https://example.com/', window);
  [...track.children].forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 320 }));
  track.dispatchEvent(new window.Event('touchstart'));
  track.scrollLeft = 200;
  track.dispatchEvent(new window.Event('scrollend'));
  assert.equal(scrolls.length, 0, 'do not move while the finger is down');
  track.dispatchEvent(new window.Event('touchend'));
  track.dispatchEvent(new window.Event('scrollend'));
  assert.deepEqual(scrolls.at(-1), { left: 320, behavior: 'instant' });
  track.scrollLeft = 100;
  track.dispatchEvent(new window.Event('scrollend'));
  assert.equal(scrolls.at(-1).left, 0, 'short drag returns to the current card');
});
test('first-run/malformed feed keeps profile link, fetch uses subdirectory', async () => {
  for (const response of [new Response('', { status: 404 }), Response.json({ version: 1, posts: [] }), new Response('<html>login</html>')]) {
    const { document, window, section } = setup();
    await initInstagram(document, window, async url => {
      assert.equal(url.href, 'https://example.github.io/fiesta/data/instagram.json');
      return response;
    });
    assert.equal(section.querySelector('.instagram-fallback').hidden, false);
    assert.equal(section.querySelector('.instagram-track').hidden, true);
    assert.equal(section.querySelectorAll('.instagram-card').length, 0);
  }
});
test('existing mobile menu, Escape, market and filling filters still work', async () => {
  const { document, window } = setup();
  const context = { document, window, innerHeight: 800, scrollY: 0, requestAnimationFrame: fn => fn(),
    ResizeObserver: class { observe() {} }, matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(await readFile('script.js', 'utf8'), context);
  const toggle = document.querySelector('.menu-toggle');
  toggle.click(); assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const escape = new window.Event('keydown'); escape.key = 'Escape'; document.dispatchEvent(escape);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  document.querySelector('[data-day="Monday"]').click();
  assert.equal([...document.querySelectorAll('.market-card')].filter(card => !card.hidden).length, 1);
  document.querySelector('[data-day="All week"]').click();
  assert.equal([...document.querySelectorAll('.market-card')].filter(card => !card.hidden).length, 9);
  document.querySelector('[data-filling="meat"]').click();
  assert.equal([...document.querySelectorAll('[data-kind]')].filter(item => !item.hidden).length, 2);
});
