// Synthetic inputs used only by tests; never copied into the production feed/build.
export const imageUrl = 'https://scontent.cdninstagram.com/test.jpg';
export function post(id, timestamp, extra = {}) {
  return { id, timestamp, caption: 'Merhaba! Gözleme, İstanbul 🥙\nLondon & Oxford\nFresh today.',
    permalink: `https://www.instagram.com/p/test_${id}/`, media_type: 'IMAGE', media_url: imageUrl, ...extra };
}
export const records = [
  post('10', '2020-01-01T12:00:00Z'), // Older pinned/grid-first post.
  post('12', '2026-11-12T12:00:00Z'),
  post('14', '2026-11-14T12:00:00Z'),
  post('13', '2026-11-13T12:00:00Z'),
  post('14', '2026-11-14T12:00:00Z')
];
