// One-time migration from the existing handwritten cards; does not contact Supabase.
import { readFile, writeFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
const { document } = parseHTML(await readFile('index.html', 'utf8'));
const clock = text => { const [, h, min = '00', period] = text.match(/(\d+)(?::(\d+))?(am|pm)/); return `${String(Number(h) % 12 + (period === 'pm' ? 12 : 0)).padStart(2, '0')}:${min}`; };
const markets = [...document.querySelectorAll('.market-card')].map((card, sort_order) => {
  const name = card.querySelector('h3').textContent;
  return { id: `00000000-0000-4000-8000-${String(sort_order + 1).padStart(12, '0')}`, name,
    address: card.querySelector('.residency')?.textContent || name,
    postcode: card.querySelector('.postcode').textContent, description: '', color: '#fff2db', sort_order,
    published: true, expires_at: null,
    schedule: [...card.querySelectorAll('[data-hours-day]')].map(row => {
      const label = row.querySelector('dt').textContent, [start, end] = row.querySelector('dd').textContent.split('–').map(clock);
      const match = label.match(/\w+ (\d+) (Nov|Dec)/);
      return { ...(match ? { date: `2026-${match[2] === 'Nov' ? '11' : '12'}-${match[1].padStart(2, '0')}` } : { day: row.dataset.hoursDay }), start, end };
    }) };
});
await writeFile('data/markets.json', JSON.stringify(markets, null, 2) + '\n');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const rows = markets.map(m => `(${[m.id, m.name, m.address, m.postcode, m.description, m.color].map(quote).join(', ')}, ${m.sort_order}, ${quote(JSON.stringify(m.schedule))}::jsonb, true)`).join(',\n');
await writeFile('supabase/002-seed-markets.sql', `-- Import the existing ten locations. Re-running never overwrites edits.\ninsert into public.markets (id, name, address, postcode, description, color, sort_order, schedule, published) values\n${rows}\non conflict (id) do nothing;\n`);
