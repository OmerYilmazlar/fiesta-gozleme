import { supabaseUrl } from './supabase-config.js';

const field = (id, label, selector, type = 'text') => ({ id, label, selector, type });
const link = (id, label, selector) => [field(`${id}_text`, `${label} text`, selector, 'label'), field(`${id}_link`, `${label} destination`, selector, 'link')];
const photo = (id, label, selector) => [field(`${id}_image`, label, selector, 'image'), field(`${id}_alt`, `${label}: description for accessibility`, selector, 'alt')];
const intro = selector => [field('eyebrow', 'Small heading', `${selector} .section-title .eyebrow`), field('heading', 'Heading', `${selector} .section-title h2`, 'heading'), field('intro', 'Introduction', `${selector} .section-title > p:last-child`, 'multiline')];
export const sections = [
  { id: 'header', label: 'Announcement & navigation', target: '.announcement', fields: [
    field('announcement', 'Announcement opening', '.announcement', 'label'), field('announcement_end', 'Announcement ending', '.announcement > span'), ...link('announcement_button', 'Announcement button', '.announcement > a'),
    ...photo('logo', 'Logo', '.header .brand-logo'), ...[1, 2, 3, 4].flatMap(n => link(`nav${n}`, `Navigation item ${n}`, `#navigation > a:nth-child(${n})`))] },
  { id: 'hero', label: 'Hero — main introduction', target: '.hero', fields: [
    field('eyebrow', 'Small heading', '.hero .eyebrow'), field('heading', 'Main heading (one line per line)', '.hero h1', 'heading'), field('intro', 'Introduction', '.hero .lead', 'multiline'),
    ...link('primary', 'Main button', '.hero .button'), ...link('secondary', 'Second button', '.hero .underlink'), ...photo('hero', 'Main image', '.hero-photo img'),
    field('caption', 'Image caption', '.hero-photo figcaption'), field('stamp', 'Round image badge', '.food-stamp', 'heading')] },
  { id: 'highlights', label: 'Highlights & market shortcut', target: '.values', fields: [
    ...[1, 2, 3, 4, 5].map(n => ({ ...field(`value${n}`, `Highlight ${n}`, `.values-track > span:nth-of-type(${n})`), group: `highlight${n}` })), field('heading', 'Shortcut heading', '.quick-find b'), field('detail', 'Shortcut description', '.quick-find div > span'), ...link('button', 'Shortcut button', '.quick-find > a')] },
  { id: 'menu', label: 'Menu & prices', target: '#menu', fields: [
    ...intro('#menu'), ...[1, 2, 3].flatMap(n => { const s = `.menu-row:nth-child(${n})`; return [field(`item${n}_tag`, `Item ${n}: small heading`, `${s} .menu-number`), field(`item${n}_name`, `Item ${n}: name`, `${s} h3`, 'heading'), field(`item${n}_description`, `Item ${n}: description`, `${s} p`, 'multiline'), field(`item${n}_price`, `Item ${n}: price`, `${s} > strong`)]; }),
    field('combinations_label', 'Combinations button', '.signature summary'), ...[1, 2, 3, 4, 5].map(n => field(`combination${n}`, `Combination ${n}`, `.signature li:nth-child(${n})`)),
    ...[1, 2, 3].flatMap(n => [...photo(`photo${n}`, `Menu photo ${n}`, `.food-strip figure:nth-child(${n}) img`), field(`caption${n}`, `Photo ${n}: caption`, `.food-strip figure:nth-child(${n}) figcaption`)]), field('footnote', 'Availability & allergen note', '#menu .footnote', 'multiline')] },
  { id: 'sides', label: 'Fillings, sides & drinks', target: '.filling-section', fields: [
    field('eyebrow', 'Fillings small heading', '.filling-section .eyebrow'), field('heading', 'Fillings heading', '.filling-section h3', 'heading'),
    ...[1, 2, 3, 4, 5, 6].map(n => field(`filling${n}`, `Filling ${n}`, `.ingredients > span:nth-child(${n})`)),
    field('side_tag', 'Sides small heading', '.sides > div:first-child .eyebrow'), field('side_heading', 'Sides heading', '.sides h3'), field('side_text', 'Sides list', '.sides > div:first-child p', 'multiline'), field('drink_tag', 'Drinks small heading', '.sides > div:last-child .eyebrow'),
    ...[1, 2].flatMap(n => [field(`drink${n}`, `Drink ${n}`, `.sides .drink:nth-of-type(${n})`, 'label'), field(`price${n}`, `Drink ${n}: price`, `.sides .drink:nth-of-type(${n}) strong`)])] },
  { id: 'markets', label: 'Markets introduction', target: '#markets', fields: [...intro('#markets'), field('notice', 'Travel notice', '.market-meta > p:last-child', 'multiline')] },
  { id: 'giftcards', label: 'Gift cards', target: '#giftcards', fields: [
    field('eyebrow', 'Small heading', '#giftcards .eyebrow'), field('heading', 'Heading', '#giftcards h2', 'heading'),
    field('intro', 'Introduction', '.giftcards-intro', 'multiline'), field('note', 'How to order', '.giftcards-note', 'multiline'),
    ...link('button', 'Gift card enquiry button', '#giftcards .button'), field('badge', 'Availability badge', '.giftcards-badge'),
    field('brand', 'Name on all cards', '.gift-card-brand'), field('card_label', 'Label on all cards', '.gift-card-label'),
    { ...field('artwork_image', 'Optional gift card photo (replaces the card design)', '.giftcards-photo', 'image'), optional: true },
    field('artwork_alt', 'Gift card photo: description for accessibility', '.giftcards-photo', 'alt'),
    ...[1, 2, 3].map(n => field(`amount${n}`, `Card ${n}: amount`, `.gift-card:nth-child(${n}) strong`))] },
  { id: 'story', label: 'Our story', target: '#story', fields: [field('eyebrow', 'Small heading', '.story-content .eyebrow'), field('heading', 'Heading', '.story-content h2', 'heading'), ...[1, 2].map(n => field(`paragraph${n}`, `Paragraph ${n}`, `.story-content > p:not(.eyebrow):nth-of-type(${n + 1})`, 'multiline')), ...link('button', 'Story button', '.story-content > a'), ...photo('story', 'Story image', '.story-art img'), field('caption', 'Image caption', '.story-art figcaption')] },
  { id: 'instagram', label: 'Instagram section heading', target: '#instagram', fields: [field('eyebrow', 'Small heading', '#instagram .eyebrow'), field('heading', 'Heading', '#instagram-title', 'heading'), ...link('follow', 'Follow button', '.instagram-follow a')] },
  { id: 'gallery', label: 'Photo gallery', target: '#gallery', fields: [...intro('#gallery'), ...[1, 2, 3, 4, 5, 6].flatMap(n => [...photo(`photo${n}`, `Gallery image ${n}`, `.photo-grid figure:nth-child(${n}) img`), field(`caption${n}`, `Image ${n}: caption`, `.photo-grid figure:nth-child(${n}) figcaption`)].map(f => ({ ...f, group: `gallery${n}`, ...(f.type === 'image' ? { optional: true, resetLabel: n <= 5 ? 'Use original image' : 'Remove image' } : {}) }))), ...link('button', 'Gallery button', '#gallery > a')] },
  { id: 'contact', label: 'Contact', target: '#contact', fields: [field('eyebrow', 'Small heading', '#contact .eyebrow'), field('heading', 'Heading', '#contact h2', 'heading'), field('intro', 'Introduction', '#contact > p:not(.eyebrow)', 'multiline'), ...link('email_button', 'Email button', '#contact .actions > a:first-child'), ...link('phone_button', 'Phone button', '#contact .actions > a:last-child'), ...link('email', 'Displayed email', '#contact > .email')] },
  { id: 'footer', label: 'Footer & social links', target: 'footer', fields: [field('tagline', 'Footer tagline', 'footer > p'), ...photo('logo', 'Footer logo', 'footer .brand-logo'), field('instagram', 'Instagram profile URL', '.footer-socials a:first-child, .announcement-socials a:first-child', 'link'), field('facebook', 'Facebook profile URL', '.footer-socials a:last-child, .announcement-socials a:last-child', 'link'), ...link('mobile_menu', 'Mobile menu button', '.mobile-nav a:first-child'), ...link('mobile_markets', 'Mobile markets button', '.mobile-nav a:last-child')] }
];
export function safeLink(value) {
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f]/.test(value)) return false;
  if (/^#[a-z0-9_-]*$/i.test(value)) return true;
  try { const u = new URL(value); return (u.protocol === 'https:' && !!u.hostname && !u.username && !u.password) || (/^(mailto|tel):$/.test(u.protocol) && u.pathname.length > 0); } catch { return false; }
}
export function safeImage(value) {
  if (typeof value !== 'string') return false;
  return /^assets\/[a-z0-9_/-]+\.(jpg|jpeg|png|webp)$/i.test(value) && !value.includes('..') || value.startsWith(`${supabaseUrl}/storage/v1/object/public/site-images/`) && /^[a-z0-9/-]+\.webp$/i.test(value.slice(`${supabaseUrl}/storage/v1/object/public/site-images/`.length));
}
export function validateContent(section, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw Error('Invalid section content.');
  for (const f of section.fields) {
    const value = content[f.id];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > (['multiline', 'heading'].includes(f.type) ? 3000 : 1000)) throw Error(`${f.label}: text is too long.`);
    if (f.type === 'link' && !safeLink(value)) throw Error(`${f.label}: use an https:// URL, #section, mailto: or tel: link.`);
    if (f.type === 'image' && !(f.optional && value === '') && !safeImage(value)) throw Error(`${f.label}: choose an existing image or upload a replacement.`);
  }
  return content;
}
function readText(node) { return [...node.childNodes].map(n => n.nodeType === 3 ? n.textContent : n.nodeName === 'BR' ? '\n' : readText(n)).join(''); }
export function extractContent(document, section) {
  return Object.fromEntries(section.fields.map(f => {
    const n = document.querySelector(f.selector); if (!n) throw Error(`Missing content target: ${f.selector}`);
    return [f.id, f.type === 'link' ? n.getAttribute('href') : f.type === 'image' ? n.getAttribute('src') || '' : f.type === 'alt' ? n.getAttribute('alt') || '' : f.type === 'label' ? [...n.childNodes].find(c => c.nodeType === 3)?.textContent.trim() || '' : readText(n)];
  }));
}
export function applyContent(document, section, content) {
  validateContent(section, content);
  for (const f of section.fields) {
    if (content[f.id] === undefined) continue;
    const value = content[f.id];
    for (const n of document.querySelectorAll(f.selector)) {
      if (f.type === 'image' && f.optional && !value) { n.removeAttribute('src'); continue; }
      if (['link', 'image', 'alt'].includes(f.type)) { n.setAttribute({ link: 'href', image: 'src', alt: 'alt' }[f.type], value); continue; }
      if (f.type === 'label') { const text = [...n.childNodes].find(c => c.nodeType === 3); if (text) text.textContent = value + ' '; continue; }
      const emphasis = f.type === 'heading' && !!n.querySelector('em');
      n.replaceChildren();
      value.split('\n').forEach((line, i, lines) => {
        if (i) n.append(document.createElement('br'));
        if (emphasis && i === lines.length - 1) { const em = document.createElement('em'); em.textContent = line; n.append(em); }
        else n.append(document.createTextNode(line));
      });
    }
  }
  syncCollections(document);
}

// Fixed slots retain compatibility with saved content and allow safe removal.
export function syncCollections(document) {
  const highlights = [...document.querySelectorAll('.values-track > span')];
  let first = true;
  for (const item of highlights) { item.hidden = !item.textContent.trim(); item.toggleAttribute('data-first', first && !item.hidden); if (!item.hidden) first = false; }
  const bar = document.querySelector('.values'); if (bar) bar.hidden = first;
  const figures = [...document.querySelectorAll('.photo-grid > figure')];
  for (const figure of figures) figure.hidden = !figure.querySelector('img')?.getAttribute('src');
  const visible = figures.filter(f => !f.hidden), count = visible.length;
  visible.forEach((figure, index) => { figure.dataset.gallerySpan = String(count === 1 ? 6 : count === 2 || count === 4 || count === 5 && index >= 3 ? 3 : 2); });
}
