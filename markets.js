import { supabaseUrl, supabaseKey } from './supabase-config.js';
import { renderMarkets } from './market-data.js';

let saved;
async function refresh() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/markets?select=*&order=sort_order.asc,name.asc`, { headers: { apikey: supabaseKey }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw Error('Market data unavailable');
    const data = await response.json();
    if (!Array.isArray(data)) throw Error('Invalid market data');
    saved = data;
  } catch {
    if (!saved) {
      try { const r = await fetch(new URL('./data/markets.json', import.meta.url)); if (r.ok) saved = await r.json(); } catch { /* Keep the static listings when offline. */ }
    }
  }
  if (saved) renderMarkets(document, saved);
}
refresh();
setInterval(refresh, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
