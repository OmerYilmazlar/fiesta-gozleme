export function validateFeed(feed) {
  if (feed?.version !== 1 || !Array.isArray(feed.posts) || !feed.posts.length) throw new Error('No feed');
  const ids = new Set();
  for (const post of feed.posts) {
    if (!/^\d+$/.test(post.id) || ids.has(post.id) || typeof post.caption !== 'string' ||
        !Number.isFinite(Date.parse(post.timestamp)) ||
        !['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(post.mediaType) ||
        !/^assets\/instagram\/\d+-[a-f0-9]{24}\.webp$/.test(post.image) ||
        !Number.isInteger(post.width) || post.width < 1 || !Number.isInteger(post.height) || post.height < 1 ||
        !/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/?$/.test(post.permalink)) throw new Error('Invalid feed');
    ids.add(post.id);
  }
  return [...feed.posts].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function renderFeed(section, posts, baseUrl, win = window) {
  const doc = section.ownerDocument;
  const track = section.querySelector('.instagram-track');
  const fragment = doc.createDocumentFragment();
  const make = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  posts.forEach((post, index) => {
    const card = make('article', 'instagram-card');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Instagram post ${index + 1} of ${posts.length}`);
    const media = make('a', 'instagram-media');
    media.href = post.permalink;
    media.target = '_blank'; media.rel = 'noopener noreferrer';
    media.setAttribute('aria-label', `Open ${post.mediaType === 'VIDEO' ? 'video' : 'post'} ${index + 1} on Instagram (new tab)`);
    const img = make('img');
    img.src = baseUrl ? new URL(post.image, baseUrl).href : post.image;
    img.width = post.width; img.height = post.height;
    img.alt = `Fiesta Gözleme ${post.mediaType === 'VIDEO' ? 'video preview' : 'Instagram post'}; caption below`;
    img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { img.hidden = true; media.classList.add('image-unavailable'); });
    media.append(img);
    media.append(make('span', 'instagram-image-fallback', 'Preview unavailable. Open on Instagram ↗'));
    card.append(media);
    const body = make('div', 'instagram-body');
    if (post.mediaType !== 'IMAGE') body.append(make('span', 'instagram-badge', post.mediaType === 'VIDEO' ? '▶ Video / Reel' : '▧ Album'));
    const time = make('time', 'instagram-date', new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Europe/London' }).format(new Date(post.timestamp)));
    time.dateTime = post.timestamp; body.append(time);
    const caption = make('p', 'instagram-caption');
    caption.id = `instagram-caption-${post.id}`;
    // Never use innerHTML: captions may contain arbitrary HTML-looking text.
    const chars = [...post.caption];
    const long = chars.length > 220 || post.caption.split('\n').length > 5;
    const preview = chars.slice(0, 220).join('').split('\n').slice(0, 5).join('\n');
    caption.textContent = long ? `${preview}…` : post.caption;
    body.append(caption);
    if (long) {
      const more = make('button', 'instagram-more', 'Read more');
      more.type = 'button'; more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', caption.id);
      more.addEventListener('click', () => {
        const expanded = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(expanded));
        more.textContent = expanded ? 'Read less' : 'Read more';
        caption.textContent = expanded ? post.caption : `${preview}…`;
      });
      body.append(more);
    }
    const original = make('a', 'underlink instagram-original', 'View on Instagram ↗');
    original.href = post.permalink; original.target = '_blank'; original.rel = 'noopener noreferrer';
    body.append(original); card.append(body); fragment.append(card);
  });
  track.replaceChildren(fragment);
  track.hidden = false;
  section.querySelector('.instagram-fallback').hidden = true;
  const controls = section.querySelector('.instagram-controls');
  const prev = controls.querySelector('[data-direction="previous"]');
  const next = controls.querySelector('[data-direction="next"]');
  const status = controls.querySelector('[role="status"]');
  const dotsContainer = controls.querySelector('.instagram-dots');
  const dots = posts.map((post, index) => {
    const dot = make('button', 'instagram-dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show Instagram post ${index + 1} of ${posts.length}`);
    dot.setAttribute('aria-controls', track.id);
    dot.setAttribute('aria-pressed', String(index === 0));
    dot.addEventListener('click', () => move(index));
    return dot;
  });
  dotsContainer.replaceChildren(...dots);
  const cards = [...track.children];
  const nearest = () => cards.reduce((best, card, i) => Math.abs(card.offsetLeft - cards[0].offsetLeft - track.scrollLeft) < Math.abs(cards[best].offsetLeft - cards[0].offsetLeft - track.scrollLeft) ? i : best, 0);
  const update = () => {
    const overflow = track.scrollWidth > track.clientWidth + 2;
    controls.hidden = !overflow;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    const active = nearest();
    status.textContent = `Post ${active + 1} of ${posts.length}`;
    dots.forEach((dot, index) => dot.setAttribute('aria-pressed', String(index === active)));
  };
  const move = index => {
    const target = cards[Math.max(0, Math.min(index, cards.length - 1))];
    track.scrollTo({ left: target.offsetLeft - cards[0].offsetLeft,
      behavior: win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  prev.addEventListener('click', () => move(nearest() - 1));
  next.addEventListener('click', () => move(nearest() + 1));
  track.addEventListener('keydown', event => {
    if (event.target !== track) return; // Preserve ordinary keys inside links/buttons.
    const index = nearest();
    const targets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: cards.length - 1 };
    if (event.key in targets) { event.preventDefault(); move(targets[event.key]); }
  });
  // Keep native swiping, then settle to the closest whole card even after a slow drag.
  // Reduced motion removes animation, not snapping. No automatic advancement.
  let touching = false;
  let settleTimer;
  const settle = () => {
    if (touching || track.scrollWidth <= track.clientWidth + 2) return;
    const index = nearest();
    const left = cards[index].offsetLeft - cards[0].offsetLeft;
    if (Math.abs(track.scrollLeft - left) > 1) move(index);
  };
  const scheduleSettle = () => {
    win.clearTimeout(settleTimer);
    settleTimer = win.setTimeout(settle, 160);
  };
  track.addEventListener('touchstart', () => {
    touching = true;
    win.clearTimeout(settleTimer);
  }, { passive: true });
  const release = () => { touching = false; scheduleSettle(); };
  track.addEventListener('touchend', release, { passive: true });
  track.addEventListener('touchcancel', release, { passive: true });
  track.addEventListener('scrollend', settle);
  track.addEventListener('scroll', () => { update(); scheduleSettle(); }, { passive: true });
  win.addEventListener('resize', update);
  if (win.ResizeObserver) new win.ResizeObserver(update).observe(track);
  update();
}

export async function initInstagram(doc = document, win = window, fetchImpl = fetch) {
  const section = doc.querySelector('#instagram');
  if (!section) return;
  const baseUrl = new URL('./', doc.baseURI);
  try {
    const response = await fetchImpl(new URL('data/instagram.json', baseUrl));
    if (!response.ok) return;
    const posts = validateFeed(await response.json());
    renderFeed(section, posts, baseUrl, win);
  } catch { /* First run or invalid/unavailable feed: retain the honest profile link. */ }
}

if (typeof document !== 'undefined') initInstagram();
