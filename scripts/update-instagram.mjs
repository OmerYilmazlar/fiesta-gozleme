import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { fetchPosts as officialPosts } from './providers/meta-facebook.mjs';
import { fetchPosts as publicPosts } from './providers/public-instagram.mjs';
import { newestDistinct } from './lib/feed.mjs';
import { FeedError, readResponse } from './lib/http.mjs';
import { validateFeed } from '../instagram-feed.js';

function permittedImageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new FeedError('Invalid media URL.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !['cdninstagram.com', 'fbcdn.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new FeedError('Media URL is not on an approved Meta CDN.');
  }
  return url;
}

export async function downloadImage(value, fetchImpl = fetch) {
  let url = permittedImageUrl(value);
  try {
    for (let redirects = 0; redirects < 4; redirects++) {
      // Do not send the API bearer token to the media host.
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        url = permittedImageUrl(new URL(response.headers.get('location'), url).href);
        continue;
      }
      if (!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type') || '')) throw new FeedError('Expected a JPEG, PNG or WebP image.');
      const input = await readResponse(response, 20 * 1024 * 1024);
      const metadata = await sharp(input, { limitInputPixels: 40000000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new FeedError('Image bytes do not match a permitted raster format.');
      // Fully decode/re-encode to catch truncated images and strip embedded metadata.
      const { data, info } = await sharp(input, { failOn: 'warning', limitInputPixels: 40000000 })
        .rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
      if (!info.width || !info.height) throw new FeedError('Image has invalid dimensions.');
      return { data, width: info.width, height: info.height };
    }
    throw new FeedError('Too many image redirects.');
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError('Image download or decoding failed; previous feed preserved.');
  }
}

export async function updateFeed({ root = process.cwd(), provider, fetchImpl = fetch, env = process.env } = {}) {
  const config = JSON.parse(await readFile(join(root, 'instagram.config.json'), 'utf8'));
  provider ??= config.provider === 'public-html' ? publicPosts : officialPosts;
  const posts = newestDistinct(await provider({ config, token: env.INSTAGRAM_ACCESS_TOKEN, userId: env.INSTAGRAM_USER_ID, fetchImpl }), config.postCount);
  const stage = await mkdtemp(join(root, '.instagram-stage-'));
  try {
    const prepared = [];
    for (const post of posts) {
      const image = await downloadImage(post.remoteImage, fetchImpl);
      const hash = createHash('sha256').update(image.data).digest('hex').slice(0, 24);
      const filename = `${post.id}-${hash}.webp`;
      await writeFile(join(stage, filename), image.data);
      // Explicit allowlist: remote CDN URLs and credentials cannot enter the static feed.
      prepared.push({ id: post.id, caption: post.caption, timestamp: post.timestamp,
        permalink: post.permalink, mediaType: post.mediaType,
        image: `assets/instagram/${filename}`, width: image.width, height: image.height });
    }
    const feed = { version: 1, profileUrl: config.profileUrl, posts: prepared };
    validateFeed(feed);
    const serialized = JSON.stringify(feed, null, 2) + '\n';
    const destination = join(root, 'data', 'instagram.json');
    let previous;
    try { previous = await readFile(destination, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(join(root, 'assets', 'instagram'), { recursive: true });
    await mkdir(join(root, 'data'), { recursive: true });
    // Immutable content-addressed files are published first. The JSON pointer switches last.
    // Keep old generations so failed runs and cached clients can still use the old feed.
    for (const post of prepared) {
      const filename = post.image.split('/').pop();
      await rename(join(stage, filename), join(root, post.image));
    }
    if (serialized === previous) return { changed: false, count: prepared.length };
    await writeFile(join(stage, 'instagram.json'), serialized);
    await rename(join(stage, 'instagram.json'), destination);
    return { changed: true, count: prepared.length };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await updateFeed();
    console.log(`Instagram refresh validated ${result.count} posts; ${result.changed ? 'feed updated' : 'content unchanged'}.`);
  } catch (error) {
    console.error(error instanceof FeedError ? error.message : 'Instagram update failed. Previous feed retained; check configuration and filesystem access.');
    process.exitCode = 1;
  }
}
