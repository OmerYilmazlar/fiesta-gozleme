export const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function londonClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function validateMarket(m) {
  if (!m.name?.trim() || m.name.length > 150 || !m.address?.trim() || m.address.length > 300) throw Error('Enter a name and address (up to 150 and 300 characters).');
  if (!/^#[a-f0-9]{6}$/i.test(m.color)) throw Error('Choose a valid card colour.');
  if (!Array.isArray(m.schedule) || m.schedule.length > 200) throw Error('Use no more than 200 trading dates.');
  for (const r of m.schedule) {
    if (r.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0, 10) !== r.date) throw Error('Enter a valid trading date.');
    } else if (!days.includes(r.day)) throw Error('Choose a weekday or an individual date.');
    if (![r.start, r.end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || r.end <= r.start) throw Error('Closing time must be after opening time on the same day.');
  }
  if (m.expires_at && !Number.isFinite(Date.parse(m.expires_at))) throw Error('Enter a valid expiry date.');
  return m;
}
export function activeSchedule(m, now = new Date()) {
  if (!m.published || (m.expires_at && new Date(m.expires_at) <= now)) return [];
  const clock = londonClock(now);
  return m.schedule.filter(r => !r.date || `${r.date}T${r.end}` > clock);
}
export function rowDay(row) { return row.date ? days[new Date(`${row.date}T12:00:00Z`).getUTCDay()] : row.day; }
export function textColor(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => { const n = parseInt(v, 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#24170f' : '#ffffff';
}
export function renderMarkets(document, markets, now = new Date()) {
  const list = document.querySelector('.market-list');
  list.replaceChildren();
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  for (const m of markets) {
    try { validateMarket(m); } catch { continue; }
    const rows = activeSchedule(m, now);
    if (!rows.length) continue;
    const card = el('article', undefined, 'market-card'); card.dataset.managed = 'true';
    card.dataset.marketDays = [...new Set(rows.map(rowDay))].join(',');
    card.style.backgroundColor = m.color; card.style.color = textColor(m.color);
    card.append(el('span', m.postcode, 'postcode'), el('h3', m.name), el('p', m.address, 'residency'));
    if (m.description) card.append(el('p', m.description, 'residency'));
    const dl = el('dl');
    for (const row of rows) {
      const div = el('div'); div.dataset.hoursDay = rowDay(row);
      const label = row.date ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.date}T12:00:00Z`)) : row.day;
      div.append(el('dt', label), el('dd', `${row.start}–${row.end}`)); dl.append(div);
    }
    const a = el('a', 'Get directions →', 'underlink');
    a.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${m.name} ${m.address} ${m.postcode}`)}`;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit';
    card.append(dl, a); list.append(card);
  }
  document.querySelector('[data-day][aria-pressed="true"]')?.click();
  if (!list.children.length) list.append(el('p', 'New dates are coming soon. Follow us on Instagram for updates.'));
}
