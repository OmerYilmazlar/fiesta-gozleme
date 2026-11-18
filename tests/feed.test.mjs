import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { newestDistinct, normalizePost } from '../scripts/lib/feed.mjs';
import { fetchPosts } from '../scripts/providers/meta-facebook.mjs';
import { fetchPosts as fetchPublicPosts, publicPost } from '../scripts/providers/public-instagram.mjs';
import { updateFeed, downloadImage } from '../scripts/update-instagram.mjs';
import { build } from '../scripts/build.mjs';
import { post, records, imageUrl } from './fixtures/posts.mjs';

const config = { username: 'fiestagozleme', profileUrl: 'https://www.instagram.com/fiestagozleme/', postCount: 3, apiVersion: 'v27.0' };
const bytes = await sharp({ create: { width: 4, height: 8, channels: 3, background: '#bf371e' } }).png().toBuffer();
const imageFetch = async () => new Response(bytes, { headers: { 'content-type': 'image/png' } });
test('public provider uses no cookies/token, reads publication timestamps and ignores pinned order', async () => {
  const publicRecords = records.slice(0, 4).map(record => ({ pk: record.id, code: `post_${record.id}`,
    media_type: 1, user: { username: 'fiestagozleme' }, caption: { text: record.caption },
    taken_at: Date.parse(record.timestamp) / 1000, display_uri: imageUrl }));
  const html = value => new Response(`<script type="application/json">${JSON.stringify({ nested: value })}</script>`, { headers: { 'content-type': 'text/html' } });
  const result = await fetchPublicPosts({ config, fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'manual');
    const match = String(url).match(/\/p\/(post_\d+)\//);
    return html(match ? publicRecords.find(p => p.code === match[1]) : publicRecords.map(({ taken_at, ...p }) => p));
  } });
  assert.deepEqual(result.map(p => p.id), ['14', '13', '12']);
  assert.equal(result[0].caption, records[0].caption);
  assert.throws(() => publicPost({ ...publicRecords[0], taken_at: undefined }, 'fiestagozleme'));
  assert.throws(() => publicPost({ ...publicRecords[0], caption: {} }, 'fiestagozleme'));
});
test('public provider stops at login redirects, blocked requests or missing structured posts', async () => {
  for (const response of [new Response('Login', { status: 302, headers: { 'content-type': 'text/html', location: '/accounts/login/' } }),
    new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/html' } }),
    new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })]) {
    await assert.rejects(fetchPublicPosts({ config, fetchImpl: async () => response }));
  }
});
test('redirect diagnostics identify login gates without exposing query parameters', async () => {
  await assert.rejects(fetchPublicPosts({ config, fetchImpl: async () => new Response(null, {
    status: 302, headers: { location: 'https://www.instagram.com/accounts/login/?secret=do-not-log' }
  }) }), error => error.message.includes('a login page (HTTP 302)') && !error.message.includes('do-not-log'));
});
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'fiesta-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'instagram.config.json'), JSON.stringify(config));
  return root;
}
test('sorts by publication date, ignores pinned order and deduplicates to exactly three', () => {
  assert.deepEqual(newestDistinct(records, 3).map(p => p.id), ['14', '13', '12']);
  assert.equal(newestDistinct(records.slice(0, 2), 3).length, 2);
  assert.throws(() => newestDistinct([], 3));
  assert.throws(() => newestDistinct([post('1', 'invalid')], 3));
  assert.throws(() => newestDistinct([records[0], { ...records[0], timestamp: records[1].timestamp }], 3));
});
test('preserves Unicode, multiline captions; albums choose first image; video uses thumbnail', () => {
  assert.equal(normalizePost(records[0]).caption, records[0].caption);
  const album = normalizePost(post('1', records[0].timestamp, { media_type: 'CAROUSEL_ALBUM', children: { data: [
    { media_type: 'VIDEO', thumbnail_url: imageUrl + '?video' },
    { media_type: 'IMAGE', media_url: imageUrl + '?first' },
    { media_type: 'IMAGE', media_url: imageUrl + '?second' }
  ] } }));
  assert.equal(album.remoteImage, imageUrl + '?first');
  assert.equal(normalizePost(post('2', records[0].timestamp, { media_type: 'VIDEO', media_url: undefined, thumbnail_url: imageUrl })).remoteImage, imageUrl);
  assert.throws(() => normalizePost(post('2', records[0].timestamp, { media_type: 'VIDEO' })));
  assert.throws(() => normalizePost({ ...records[0], permalink: 'javascript:alert(1)' }));
  assert.throws(() => normalizePost({ ...records[0], caption: null }));
});
test('provider paginates and rereads all retained details, including edited captions', async () => {
  const calls = [];
  const mock = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    url = new URL(url); calls.push(url);
    let data;
    if (url.pathname.endsWith('/123')) data = { id: '123', username: 'fiestagozleme' };
    else if (url.pathname.endsWith('/media')) data = url.searchParams.has('after') ? { data: records.slice(2) } : {
      data: records.slice(0, 2), paging: { next: 'https://untrusted.invalid/?access_token=DO_NOT_FOLLOW', cursors: { after: 'page-two' } }
    };
    else data = { ...records.find(p => url.pathname.endsWith('/' + p.id)), caption: 'Edited caption 🥙\nİstanbul' };
    return Response.json(data);
  };
  const posts = await fetchPosts({ config, token: 'test-secret', userId: '123', fetchImpl: mock });
  assert.deepEqual(posts.map(p => p.id), ['14', '13', '12']);
  assert.ok(posts.every(p => p.caption.startsWith('Edited')));
  assert.ok(calls.every(url => url.hostname === 'graph.facebook.com' && !url.searchParams.has('access_token')));
});
test('provider rejects missing credentials, HTML, mismatched account and incomplete retained video', async () => {
  await assert.rejects(fetchPosts({ config }));
  await assert.rejects(fetchPosts({ config, token: 'secret', userId: '123', fetchImpl: async () => new Response('<html>Login secret</html>', { headers: { 'content-type': 'text/html' } }) }), /Expected JSON/);
  await assert.rejects(fetchPosts({ config, token: 'secret', userId: '123', fetchImpl: async () => Response.json({ id: '123', username: 'wrong' }) }), /does not match/);
});
test('image downloader rejects HTML, corrupt images, disallowed hosts and unsafe redirects', async () => {
  for (const response of [new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }), new Response('invalid', { headers: { 'content-type': 'image/jpeg' } })]) {
    await assert.rejects(downloadImage(imageUrl, async () => response));
  }
  await assert.rejects(downloadImage('http://127.0.0.1/secret', imageFetch));
  await assert.rejects(downloadImage(imageUrl, async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/file' } })));
});
test('atomic refresh detects caption/media edits and keeps stable filenames for unchanged images', async t => {
  const root = await workspace(t);
  let normalized = newestDistinct(records, 3).map(normalizePost);
  const options = { root, provider: async () => normalized, fetchImpl: imageFetch };
  assert.equal((await updateFeed(options)).changed, true);
  const first = JSON.parse(await readFile(join(root, 'data/instagram.json')));
  assert.equal((await updateFeed(options)).changed, false);
  normalized = normalized.map((p, i) => i ? p : { ...p, caption: 'Edited 🥙\nİstanbul' });
  await updateFeed(options);
  const second = JSON.parse(await readFile(join(root, 'data/instagram.json')));
  assert.equal(second.posts[0].caption, normalized[0].caption);
  assert.equal(first.posts[0].image, second.posts[0].image);
  const other = await sharp({ create: { width: 5, height: 6, channels: 3, background: 'blue' } }).png().toBuffer();
  await updateFeed({ ...options, fetchImpl: async () => new Response(other, { headers: { 'content-type': 'image/png' } }) });
  const third = JSON.parse(await readFile(join(root, 'data/instagram.json')));
  assert.notEqual(third.posts[0].image, second.posts[0].image);
  assert.ok(await readFile(join(root, first.posts[0].image)));
  assert.ok(!JSON.stringify(third).includes('cdninstagram'));
});
test('failed fetch and second image failure preserve all previous files; empty responses cannot erase feed', async t => {
  const root = await workspace(t);
  const provider = async () => newestDistinct(records, 3).map(normalizePost);
  await updateFeed({ root, provider, fetchImpl: imageFetch });
  const previous = await readFile(join(root, 'data/instagram.json'), 'utf8');
  const files = await readdir(join(root, 'assets/instagram'));
  let calls = 0;
  await assert.rejects(updateFeed({ root, provider, fetchImpl: async () => {
    if (++calls === 2) throw new Error('secret URL must not be logged');
    return imageFetch();
  } }), /Image download/);
  await assert.rejects(updateFeed({ root, provider: async () => [] }));
  await assert.rejects(updateFeed({ root, provider: async () => { throw new Error('offline'); } }));
  assert.equal(await readFile(join(root, 'data/instagram.json'), 'utf8'), previous);
  assert.deepEqual(await readdir(join(root, 'assets/instagram')), files);
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.instagram-stage-')));
});
test('build publishes only static files, preserves CNAME and keeps honest first-run fallback', async t => {
  const root = await workspace(t);
  for (const file of ['index.html', 'style.css', 'script.js', 'instagram-feed.js', 'markets.js', 'market-data.js', 'supabase-config.js', 'admin.html', 'admin.css', 'admin.js', 'admin-sections.js', 'section-content.js', 'site-content.js', 'staged-images.js', 'image-storage.js', 'admin-accounts.js', 'form-changes.js']) await cp(file, join(root, file));
  await mkdir(join(root, 'assets'));
  await mkdir(join(root, 'data'), { recursive: true });
  await cp('data/markets.json', join(root, 'data/markets.json'));
  await cp('data/site-content.json', join(root, 'data/site-content.json'));
  await writeFile(join(root, '.env'), 'DO_NOT_PUBLISH');
  await writeFile(join(root, 'CNAME'), 'example.com');
  await build(root);
  assert.equal(await readFile(join(root, 'dist/CNAME'), 'utf8'), 'example.com');
  assert.ok(!(await readdir(join(root, 'dist'))).includes('.env'));
  assert.ok(!(await readdir(join(root, 'dist'))).includes('supabase'));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/data/instagram.json'))).posts, []);
  await updateFeed({ root, provider: async () => [normalizePost(records[0])], fetchImpl: imageFetch });
  await build(root);
  const feed = JSON.parse(await readFile(join(root, 'dist/data/instagram.json')));
  assert.equal(feed.posts.length, 1);
  const builtHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
  assert.ok(builtHtml.includes('class="instagram-card"'));
  assert.ok(builtHtml.includes(feed.posts[0].image));
  assert.ok(!builtHtml.includes('https://example.github.io'));
  await rm(join(root, feed.posts[0].image));
  await assert.rejects(build(root));
});
