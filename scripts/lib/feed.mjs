import { FeedError } from './http.mjs';

export function newestDistinct(records, count) {
  if (!Array.isArray(records) || records.length === 0 || !Number.isInteger(count) || count < 1) {
    throw new FeedError('No valid posts returned; retaining the previous feed.');
  }
  const unique = new Map();
  for (const item of records) {
    if (!item || !/^\d+$/.test(item.id) || typeof item.id !== 'string' ||
        typeof item.timestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(item.timestamp) ||
        !Number.isFinite(Date.parse(item.timestamp))) throw new FeedError('A post has an invalid ID or publication timestamp.');
    const previous = unique.get(item.id);
    if (previous && Date.parse(previous.timestamp) !== Date.parse(item.timestamp)) {
      throw new FeedError('Conflicting duplicate publication timestamps.');
    }
    unique.set(item.id, item);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id)).slice(0, count);
}

export function normalizePost(post) {
  newestDistinct([post], 1);
  let permalink;
  try { permalink = new URL(post.permalink); } catch { throw new FeedError('Missing post permalink.'); }
  if (permalink.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(permalink.hostname) ||
      permalink.username || permalink.password || !/^\/(p|reel|tv)\/[\w-]+\/?$/.test(permalink.pathname)) throw new FeedError('Invalid Instagram permalink.');
  if (!['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(post.media_type) ||
      (post.caption !== undefined && typeof post.caption !== 'string')) throw new FeedError('Invalid media type or caption.');
  let cover = post;
  if (post.media_type === 'CAROUSEL_ALBUM') {
    if (!Array.isArray(post.children?.data) || !post.children.data.length) throw new FeedError('Album has no cover media.');
    // Prefer the first image in an album; video-only albums use the first video thumbnail.
    cover = post.children.data.find(child => child.media_type === 'IMAGE') || post.children.data[0];
  }
  if (!['IMAGE', 'VIDEO'].includes(cover.media_type)) throw new FeedError('Unsupported cover media.');
  const remoteImage = cover.media_type === 'VIDEO' ? cover.thumbnail_url : cover.media_url;
  if (typeof remoteImage !== 'string' || !remoteImage) throw new FeedError('A retained post has no image or video thumbnail.');
  return {
    id: post.id, caption: post.caption ?? '', timestamp: new Date(post.timestamp).toISOString(),
    permalink: `${permalink.origin}${permalink.pathname}`, mediaType: post.media_type,
    remoteImage
  };
}
