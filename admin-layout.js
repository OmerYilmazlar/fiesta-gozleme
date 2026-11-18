import { defaultOrder, layoutLabels, validateOrder } from './site-layout.js';

export function createLayoutEditor({ api, status, onChange, onBusy }) {
  const form = document.querySelector('#layout-form'), list = document.querySelector('#layout-list');
  let row = null, saved = [...defaultOrder], order = [...defaultOrder], busy = false;
  const hasChanges = () => !form.closest('[hidden]') && order.join() !== saved.join();
  function render(focusId, direction) {
    list.replaceChildren();
    for (const [index, id] of order.entries()) {
      const li = document.createElement('li'), label = document.createElement('span'); label.textContent = layoutLabels[id];
      const controls = document.createElement('div'); controls.className = 'layout-controls';
      for (const [delta, text] of [[-1, 'Move up'], [1, 'Move down']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = delta < 0 ? '↑' : '↓';
        button.setAttribute('aria-label', `${text}: ${layoutLabels[id]}`); button.dataset.section = id; button.dataset.direction = String(delta);
        button.disabled = busy || index + delta < 0 || index + delta >= order.length;
        button.onclick = () => {
          if (busy) return;
          [order[index], order[index + delta]] = [order[index + delta], order[index]];
          render(id, delta); onChange([...order]);
          document.querySelector('#layout-status').textContent = `${layoutLabels[id]} moved to position ${index + delta + 1}. Not published yet.`;
        };
        controls.append(button);
      }
      li.append(label, controls); list.append(li);
    }
    for (const button of form.querySelectorAll('.actions button')) button.disabled = busy || !row;
    if (focusId) {
      const buttons = [...list.querySelectorAll('button')].filter(b => b.dataset.section === focusId && !b.disabled);
      (buttons.find(b => b.dataset.direction === String(direction)) || buttons[0])?.focus();
    }
  }
  function setBusy(value) { busy = value; onBusy(value); render(); }
  document.querySelector('#layout-reset').onclick = () => { order = [...defaultOrder]; render(); onChange([...order]); };
  document.querySelector('#layout-discard').onclick = () => { order = [...saved]; render(); onChange([...order]); };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !row || !hasChanges()) return;
    setBusy(true);
    try {
      const result = await api(`/rest/v1/site_sections?id=eq.layout&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', body: JSON.stringify({ content: { order: validateOrder(order) } }) });
      if (!result.length) throw Error('Another editor changed the page order. Reload Website sections before publishing again.');
      row = result[0]; saved = validateOrder(row.content.order); order = [...saved]; onChange([...order]);
      document.querySelector('#layout-status').textContent = 'Section order published.';
      status('Section order published. Open website pages update within one minute.');
    } catch (error) { status(error.message); } finally { setBusy(false); }
  };
  return {
    hasChanges, isBusy: () => busy, getOrder: () => [...order],
    setDisabled(value) { busy = value; render(); },
    load(rows) { row = rows.find(r => r.id === 'layout') || null; saved = row ? validateOrder(row.content.order) : [...defaultOrder]; order = [...saved]; form.hidden = false; render(); onChange([...order]); if (!row) document.querySelector('#layout-status').textContent = 'Section ordering needs database setup.'; },
    clear() { row = null; order = [...defaultOrder]; saved = [...defaultOrder]; form.hidden = true; document.querySelector('#layout-status').textContent = ''; }
  };
}
