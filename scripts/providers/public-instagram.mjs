import { parseHTML } from 'linkedom';
import { FeedError, readResponse } from '../lib/http.mjs';
import { newestDistinct, normalizePost } from '../lib/feed.mjs';

// Public HTML only: no cookies, login, private endpoints or access-control workarounds.
export function mediaObjects(html) {
  const { document } = parseHTML(html);
  const found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.code === 'string' && value.media_type) found.push(value);
    for (const child of Object.values(value)) visit(child);
  }
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    let data;
    try { data = JSON.parse(script.textContent); } catch { continue; }
    visit(data);
  }
  return found;
}

export function publicPost(media, username) {
  if (media.user?.username?.toLowerCase() !== username.toLowerCase() || !/^[\w-]+$/.test(media.code || '') ||
      !Number.isInteger(media.taken_at) || media.taken_at <= 0 ||
      !Object.hasOwn(media, 'caption') || (media.caption !== null && typeof media.caption?.text !== 'string')) {
    throw new FeedError('Public post is incomplete or belongs to another account.');
  }
  const types = { 1: 'IMAGE', 2: 'VIDEO', 8: 'CAROUSEL_ALBUM' };
  const image = item => {
    const candidates = item.image_versions2?.candidates;
    const best = Array.isArray(candidates) ? [...candidates].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url : null;
    return best || item.display_uri;
  };
  return normalizePost({
    id: media.pk, timestamp: new Date(media.taken_at * 1000).toISOString(),
    caption: media.caption?.text ?? '', media_type: types[media.media_type],
    permalink: `https://www.instagram.com/${media.media_type === 2 ? 'reel' : 'p'}/${media.code}/`,
    media_url: image(media), thumbnail_url: image(media),
    children: media.media_type === 8 ? { data: (media.carousel_media || []).map(child => ({
      media_type: types[child.media_type], media_url: image(child), thumbnail_url: image(child)
    })) } : undefined
  });
}

async function publicHtml(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      let target;
      try { target = new URL(response.headers.get('location'), url); } catch { /* Malformed redirect. */ }
      const instagram = target && ['instagram.com', 'www.instagram.com'].includes(target.hostname);
      const destination = instagram && /^\/accounts\/login(?:\/|$)/.test(target.pathname) ? 'a login page'
        : instagram && /^\/(challenge|checkpoint)(?:\/|$)/.test(target.pathname) ? 'an access challenge'
        : instagram ? 'another Instagram page' : 'an unrecognized destination';
      // Only classify the destination; never log query strings or follow access gates.
      throw new FeedError(`Instagram redirected to ${destination} (HTTP ${response.status}). No redirect followed; saved feed retained.`);
    }
    if (!response.headers.get('content-type')?.includes('text/html')) throw new FeedError('Instagram did not return public HTML.');
    return (await readResponse(response, 5 * 1024 * 1024)).toString('utf8');
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError('Public Instagram request failed. No login or restriction bypass attempted.');
  }
}

export async function fetchPosts({ config, fetchImpl = fetch }) {
  if (!/^[\w.]+$/.test(config.username)) throw new FeedError('Invalid Instagram username.');
  const html = await publicHtml(`https://www.instagram.com/${config.username}/`, fetchImpl);
  const candidates = new Map();
  for (const media of mediaObjects(html)) {
    if (media.user?.username?.toLowerCase() === config.username.toLowerCase() && /^[\w-]+$/.test(media.code)) candidates.set(media.code, media);
  }
  if (!candidates.size || candidates.size > 60) throw new FeedError('Public profile returned no usable post list or an unexpected layout. Saved feed retained.');
  const posts = [];
  // Read every exposed candidate's real timestamp; never assume profile-grid order.
  // Instagram exposes only a public subset. Completeness cannot be guaranteed by scraping.
  for (const code of candidates.keys()) {
    const detail = await publicHtml(`https://www.instagram.com/p/${code}/`, fetchImpl);
    const media = mediaObjects(detail).find(item => item.code === code && Number.isInteger(item.taken_at));
    if (!media) throw new FeedError('A public post has no complete publication data. Saved feed retained.');
    posts.push(publicPost(media, config.username));
  }
  return newestDistinct(posts, config.postCount);
}
