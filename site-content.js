import { supabaseUrl, supabaseKey } from './supabase-config.js';
import { sections, applyContent } from './section-content.js';
import { applyOrder } from './site-layout.js';
async function refresh() {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/site_sections?select=id,content`, { headers: { apikey: supabaseKey }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) return;
    const rows = await r.json(); if (!Array.isArray(rows)) return;
    const layout = rows.find(row => row.id === 'layout');
    if (layout) { try { applyOrder(document, layout.content.order); } catch { /* Invalid layouts keep the current order. */ } }
    for (const row of rows) {
      const section = sections.find(s => s.id === row.id); if (!section) continue;
      try { applyContent(document, section, row.content); } catch { /* Invalid rows keep the original content. */ }
    }
  } catch { /* Static content remains available if the database is unreachable. */ }
}
refresh();
setInterval(refresh, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
