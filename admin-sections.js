import { createChangeTracker } from './form-changes.js';
import { cleanupImages, sweepImages } from './image-storage.js';
import { StagedImages, prepareImage } from './staged-images.js';
import { sections, validateContent, applyContent, syncCollections } from './section-content.js';
import { supabaseUrl } from './supabase-config.js';
import { applyOrder } from './site-layout.js';
import { createLayoutEditor } from './admin-layout.js';

export function createSectionEditor({ api, status }) {
  const $ = s => document.querySelector(s), form = $('#section-form'), picker = $('#section-picker');
  let defaults, rows = [], current, busy = false, previewReady = false;
  let updateCollectionControls = () => {};
  const staged = new StagedImages();
  const cleanupWarning = ' Image cleanup could not complete. Run 004-image-cleanup.sql in Supabase if you have not already; cleanup will retry next time you open Website sections.';
  let lastSweep = 0;
  const values = () => Object.fromEntries([...form.querySelectorAll('[data-content-field]')].map(n => [n.dataset.contentField, n.value]));
  const changes = createChangeTracker(form, { read: values });
  const hasSectionChanges = () => !form.closest('[hidden]') && (changes.hasChanges() || staged.items.size > 0);
  const layout = createLayoutEditor({ api, status, onBusy: setBusy, onChange: order => {
    const selected = picker.value;
    const ids = ['header', 'hero', 'highlights', ...order.flatMap(id => id === 'menu' ? ['menu', 'sides'] : [id]), 'footer'];
    for (const id of ids) { const option = [...picker.options].find(o => o.value === id); if (option) picker.append(option); }
    picker.value = selected;
    if (previewReady) applyOrder($('#section-preview').contentDocument, order);
  } });
  const hasChanges = () => hasSectionChanges() || layout.hasChanges();
  for (const s of sections) { const option = document.createElement('option'); option.value = s.id; option.textContent = s.label; picker.append(option); }
  const section = () => sections.find(s => s.id === picker.value);
  function preview() {
    if (!previewReady || !current) return;
    const doc = $('#section-preview').contentDocument;
    applyOrder(doc, layout.getOrder());
    try { applyContent(doc, section(), values()); } catch { return; }
    for (const f of section().fields.filter(f => f.type === 'image')) {
      const pending = staged.get(f.id);
      if (pending) for (const image of doc.querySelectorAll(f.selector)) image.src = pending.previewUrl;
    }
    syncCollections(doc);
  }
  $('#section-preview').addEventListener('load', () => {
    previewReady = true; const doc = $('#section-preview').contentDocument;
    // The preview has no script permission; disable navigation as well.
    doc.addEventListener('click', e => e.preventDefault());
    preview();
    const target = doc.querySelector(section()?.target), frameWindow = $('#section-preview').contentWindow;
    if (target) frameWindow.scrollTo(0, target.getBoundingClientRect().top + frameWindow.scrollY);
  });
  async function upload(blob) {
    const path = `${section().id}/${crypto.randomUUID()}.webp`;
    await api(`/storage/v1/object/site-images/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' } });
    return `${supabaseUrl}/storage/v1/object/public/site-images/${path}`;
  }
  function setBusy(value) {
    busy = value; picker.disabled = value;
    layout.setDisabled(value);
    for (const n of form.querySelectorAll('input,textarea,button')) n.disabled = value;
    updateCollectionControls();
  }
  function render() {
    staged.clear();
    const s = section(); current = rows.find(r => r.id === s.id);
    if (!current) throw Error('Section setup is incomplete. Run 003-site-sections.sql in Supabase.');
    const content = { ...defaults[s.id], ...current.content };
    $('#section-fields').replaceChildren();
    $('#section-title').textContent = s.label;
    const groupIds = [...new Set(s.fields.map(f => f.group).filter(Boolean))], groups = new Map(), opened = new Set();
    let add;
    const groupHasContent = id => s.fields.filter(f => f.group === id && (f.type === 'image' || s.id === 'highlights')).some(f => staged.get(f.id) || form.querySelector(`[data-content-field="${f.id}"]`)?.value.trim());
    const updateGroups = () => {
      for (const [id, node] of groups) node.hidden = !opened.has(id) && !groupHasContent(id);
      if (add) add.disabled = busy || groupIds.every(id => !groups.get(id)?.hidden);
    };
    updateCollectionControls = updateGroups;
    if (groupIds.length) {
      const controls = document.createElement('div'), hint = document.createElement('p');
      hint.textContent = s.id === 'highlights' ? 'Add up to 5 highlights. Long highlights move sideways on the website when needed.' : 'Add up to 6 images. The gallery layout adapts automatically. Removing an image takes effect when you publish.';
      add = document.createElement('button'); add.type = 'button'; add.className = 'secondary collection-add'; add.textContent = s.id === 'highlights' ? 'Add highlight' : 'Add image';
      add.onclick = () => { const id = groupIds.find(id => groups.get(id).hidden); if (!id) return; opened.add(id); updateGroups(); groups.get(id).querySelector(s.id === 'gallery' ? 'input[type="file"]' : 'input')?.focus(); };
      controls.append(hint, add); $('#section-fields').append(controls);
    }
    for (const f of s.fields) {
      const wrap = document.createElement('div'); wrap.className = 'content-field';
      const label = document.createElement('label'); label.textContent = f.label;
      const input = document.createElement(['multiline', 'heading'].includes(f.type) ? 'textarea' : 'input');
      input.dataset.contentField = f.id; input.value = content[f.id] || ''; input.maxLength = ['multiline', 'heading'].includes(f.type) ? 3000 : 1000;
      if (input.tagName === 'TEXTAREA') input.rows = f.type === 'heading' ? 3 : 4;
      if (f.type === 'image') input.readOnly = true;
      label.append(input); wrap.append(label);
      if (f.type === 'heading') { const hint = document.createElement('small'); hint.textContent = 'Each new line is shown on a new line. The existing accent colour stays on the final line.'; wrap.append(hint); }
      if (f.type === 'link') { const hint = document.createElement('small'); hint.textContent = 'Use #menu, #markets, an https:// address, mailto:email or tel:number.'; wrap.append(hint); }
      if (f.type === 'image') {
        const img = document.createElement('img'); img.className = 'image-preview'; if (input.value) img.src = input.value; img.hidden = !input.value; img.alt = f.label;
        const chooseLabel = document.createElement('label'); chooseLabel.textContent = 'Choose replacement (JPG, PNG or WebP, up to 5 MB)';
        const choose = document.createElement('input'); choose.type = 'file'; choose.accept = 'image/jpeg,image/png,image/webp'; chooseLabel.append(choose);
        const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'secondary'; reset.textContent = f.resetLabel || (f.optional ? 'Use original card design' : 'Use original image');
        reset.onclick = () => { staged.remove(f.id); input.value = defaults[s.id][f.id]; if (input.value) img.src = input.value; else img.removeAttribute('src'); img.hidden = !input.value; preview(); };
        choose.onchange = async () => {
          const file = choose.files[0]; if (!file) return;
          setBusy(true); status('Preparing your image preview...');
          try { const pending = staged.set(f.id, await prepareImage(file)); img.src = pending.previewUrl; img.hidden = false; preview(); status('Preview ready. Nothing has been uploaded. Press Publish changes to save it.'); }
          catch (e) { status(e.message); } finally { choose.value = ''; setBusy(false); }
        };
        wrap.append(img, chooseLabel, reset);
      }
      if (f.group) {
        if (!groups.has(f.group)) {
          const group = document.createElement('fieldset'), legend = document.createElement('legend'), remove = document.createElement('button');
          group.className = 'collection-item'; group.dataset.group = f.group;
          legend.textContent = s.id === 'gallery' ? `Gallery image ${groupIds.indexOf(f.group) + 1}` : f.label;
          remove.type = 'button'; remove.className = 'secondary collection-remove'; remove.textContent = s.id === 'gallery' ? 'Remove image' : 'Remove highlight';
          remove.onclick = () => {
            for (const item of s.fields.filter(item => item.group === f.group)) {
              staged.remove(item.id); form.querySelector(`[data-content-field="${item.id}"]`).value = '';
            }
            for (const image of group.querySelectorAll('.image-preview')) { image.removeAttribute('src'); image.hidden = true; }
            opened.delete(f.group); updateGroups(); preview(); add.focus();
          };
          group.append(legend, remove); groups.set(f.group, group); $('#section-fields').append(group);
        }
        groups.get(f.group).append(wrap);
      } else $('#section-fields').append(wrap);
    }
    form.hidden = false; changes.markSaved();
    setBusy(busy);
    updateGroups();
    previewReady = false; $('#section-preview').src = './index.html';
  }
  picker.onchange = () => {
    const next = picker.value;
    if (hasSectionChanges() && !confirm('Discard your unsaved section changes?')) { picker.value = current.id; return; }
    picker.value = next;
    try { render(); } catch (e) { status(e.message); }
  };
  form.oninput = () => { preview(); };
  $('#preview-size').onchange = e => { $('#section-preview').style.width = e.target.value === 'mobile' ? '375px' : '100%'; };
  $('#section-revert').onclick = () => { if (!hasSectionChanges() || confirm('Discard your unsaved section changes?')) render(); };
  form.onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      const previousImages = Object.values(current.content || {});
      const content = validateContent(section(), values());
      for (const [field, pending] of staged.items) content[field] = await upload(pending.blob);
      const result = await api(`/rest/v1/site_sections?id=eq.${current.id}&updated_at=eq.${encodeURIComponent(current.updated_at)}`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (!result.length) throw Error('Another editor changed this section. Copy your changes, then reload the section before publishing.');
      rows = rows.map(r => r.id === current.id ? result[0] : r); current = result[0];
      for (const input of form.querySelectorAll('[data-content-field]')) input.value = content[input.dataset.contentField];
      for (const f of section().fields.filter(f => f.type === 'image')) {
        const input = form.querySelector(`[data-content-field="${f.id}"]`);
        const image = input.closest('.content-field').querySelector('.image-preview');
        if (content[f.id]) image.src = content[f.id]; else image.removeAttribute('src');
        image.hidden = !content[f.id];
      }
      staged.clear(); changes.markSaved(); preview();
      const cleanup = await cleanupImages(api, previousImages);
      status('Published. Refresh the website to see your changes. Open pages update within one minute.' + (cleanup.failed ? cleanupWarning : ''));
    } catch (error) { status(error.message); } finally { setBusy(false); }
  };
  setInterval(async () => {
    if (!current || busy || Date.now() - lastSweep < 3600000 || document.hidden) return;
    lastSweep = Date.now();
    const cleanup = await sweepImages(api, sections.map(s => s.id));
    if (cleanup.failed) status(cleanupWarning.trim());
  }, 60000);
  return {
    hasChanges,
    isBusy: () => busy,
    clear() { staged.clear(); changes.clear(); layout.clear(); previewReady = false; current = null; rows = []; form.hidden = true; $('#section-fields').replaceChildren(); $('#section-preview').src = 'about:blank'; },
    async load() {
      form.hidden = true; setBusy(true); status('Loading website sections…');
      try {
        if (!defaults) { const r = await fetch('./data/site-content.json'); if (!r.ok) throw Error('Could not load the original website content.'); defaults = await r.json(); }
        rows = await api('/rest/v1/site_sections?select=id,content,updated_at');
        layout.load(rows);
        picker.value = 'hero'; render();
        const cleanup = await sweepImages(api, sections.map(s => s.id)); lastSweep = Date.now();
        status('Choose a section, edit its content, then publish when ready.' + (cleanup.failed ? cleanupWarning : ''));
      } catch (error) { status(error.message); } finally { setBusy(false); }
    }
  };
}
