import { getJson, FeedError } from '../lib/http.mjs';
import { newestDistinct, normalizePost } from '../lib/feed.mjs';

// Provider contract: normalized posts with remoteImage, never credentials in results.
export async function fetchPosts({ config, token, userId, fetchImpl = fetch }) {
  if (!token || !/^\d+$/.test(userId || '')) throw new FeedError('Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in GitHub Actions Secrets.');
  if (!/^v\d+\.0$/.test(config.apiVersion)) throw new FeedError('Invalid configured Meta API version.');
  const base = `https://graph.facebook.com/${config.apiVersion}/`;
  const request = (path, params) => {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return getJson(url, token, fetchImpl);
  };
  const account = await request(userId, { fields: 'id,username' });
  if (account.id !== userId || account.username?.toLowerCase() !== config.username.toLowerCase()) throw new FeedError('Authorized Instagram account does not match fiestagozleme.');
  const records = [];
  const cursors = new Set();
  let after;
  // Exhaust pagination before sorting: pinned/grid order is never used as chronology.
  for (let page = 0; ; page++) {
    if (page >= 100) throw new FeedError('Media pagination exceeded 100 pages; old feed preserved.');
    const response = await request(`${userId}/media`, { fields: 'id,timestamp', limit: '100', ...(after ? { after } : {}) });
    if (!Array.isArray(response.data) || (response.data.length === 0 && response.paging?.next)) throw new FeedError('Incomplete Meta media page.');
    records.push(...response.data);
    if (!response.paging?.next) break;
    after = response.paging.cursors?.after;
    if (typeof after !== 'string' || !after || cursors.has(after)) throw new FeedError('Invalid or repeated Meta pagination cursor.');
    cursors.add(after);
    // Reconstruct the next request instead of following credential-bearing paging URLs.
  }
  const selected = newestDistinct(records, config.postCount);
  const result = [];
  for (const selectedPost of selected) {
    // Refetch all retained fields each run, including captions and cover URLs.
    const detail = await request(selectedPost.id, {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children.limit(100){id,media_type,media_url,thumbnail_url}'
    });
    if (detail.id !== selectedPost.id || Date.parse(detail.timestamp) !== Date.parse(selectedPost.timestamp)) throw new FeedError('Media changed during collection; retry the refresh.');
    if (detail.children?.paging?.next) throw new FeedError('Incomplete album response.');
    result.push(normalizePost(detail));
  }
  return result;
}
