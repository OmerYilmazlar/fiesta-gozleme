import { sections, validateContent, applyContent } from './section-content.js';
import { supabaseUrl } from './supabase-config.js';

export function createSectionEditor({ api, status }) {
  const $ = s => document.querySelector(s), form = $('#section-form'), picker = $('#section-picker');
  let defaults, rows = [], current, dirty = false, busy = false, previewReady = false;
  const values = () => Object.fromEntries([...form.querySelectorAll('[data-content-field]')].map(n => [n.dataset.contentField, n.value]));
  for (const s of sections) { const option = document.createElement('option'); option.value = s.id; option.textContent = s.label; picker.append(option); }
  const section = () => sections.find(s => s.id === picker.value);
  function preview() {
    if (!previewReady || !current) return;
    const doc = $('#section-preview').contentDocument;
    try { applyContent(doc, section(), values()); } catch { return; }
  }
  $('#section-preview').addEventListener('load', () => {
    previewReady = true; const doc = $('#section-preview').contentDocument;
    // The preview has no script permission; disable navigation as well.
    doc.addEventListener('click', e => e.preventDefault());
    preview(); doc.querySelector(section()?.target)?.scrollIntoView();
  });
  async function upload(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Choose a JPG, PNG or WebP image smaller than 5 MB.');
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 50000000) { bitmap.close(); throw Error('Please resize the image to under 50 megapixels.'); }
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .88));
    if (!blob || blob.type !== 'image/webp' || blob.size > 5 * 1024 * 1024) throw Error('Could not prepare the image. Please try another image.');
    const path = `${section().id}/${crypto.randomUUID()}.webp`;
    await api(`/storage/v1/object/site-images/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' } });
    return `${supabaseUrl}/storage/v1/object/public/site-images/${path}`;
  }
  function setBusy(value) {
    busy = value; picker.disabled = value;
    for (const n of form.querySelectorAll('input,textarea,button')) n.disabled = value;
  }
  function render() {
    const s = section(); current = rows.find(r => r.id === s.id);
    if (!current) throw Error('Section setup is incomplete. Run 003-site-sections.sql in Supabase.');
    const content = { ...defaults[s.id], ...current.content };
    $('#section-fields').replaceChildren();
    $('#section-title').textContent = s.label;
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
        const img = document.createElement('img'); img.className = 'image-preview'; img.src = input.value; img.alt = f.label;
        const chooseLabel = document.createElement('label'); chooseLabel.textContent = 'Upload replacement (JPG, PNG or WebP, up to 5 MB)';
        const choose = document.createElement('input'); choose.type = 'file'; choose.accept = 'image/jpeg,image/png,image/webp'; chooseLabel.append(choose);
        const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'secondary'; reset.textContent = 'Use original image';
        reset.onclick = () => { input.value = defaults[s.id][f.id]; img.src = input.value; dirty = true; preview(); };
        choose.onchange = async () => {
          const file = choose.files[0]; if (!file) return;
          setBusy(true); status('Preparing and uploading your image…');
          try { input.value = await upload(file); img.src = input.value; dirty = true; preview(); status('Image uploaded. Press Publish changes to use it on the website.'); }
          catch (e) { status(e.message); } finally { choose.value = ''; setBusy(false); }
        };
        wrap.append(img, chooseLabel, reset);
      }
      $('#section-fields').append(wrap);
    }
    form.hidden = false; dirty = false;
    previewReady = false; $('#section-preview').src = './index.html';
  }
  picker.onchange = () => {
    const next = picker.value;
    if (dirty && !confirm('Discard your unsaved section changes?')) { picker.value = current.id; return; }
    picker.value = next;
    try { render(); } catch (e) { status(e.message); }
  };
  form.oninput = () => { dirty = true; preview(); };
  $('#preview-size').onchange = e => { $('#section-preview').style.width = e.target.value === 'mobile' ? '375px' : '100%'; };
  $('#section-revert').onclick = () => { if (!dirty || confirm('Discard your unsaved section changes?')) render(); };
  form.onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      const content = validateContent(section(), values());
      const result = await api(`/rest/v1/site_sections?id=eq.${current.id}&updated_at=eq.${encodeURIComponent(current.updated_at)}`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (!result.length) throw Error('Another editor changed this section. Copy your changes, then reload the section before publishing.');
      rows = rows.map(r => r.id === current.id ? result[0] : r); current = result[0]; dirty = false;
      status('Published. Refresh the website to see your changes. Open pages update within one minute.');
    } catch (error) { status(error.message); } finally { setBusy(false); }
  };
  return {
    hasChanges: () => dirty || busy,
    isBusy: () => busy,
    clear() { dirty = false; current = null; rows = []; form.hidden = true; $('#section-fields').replaceChildren(); $('#section-preview').src = 'about:blank'; },
    async load() {
      form.hidden = true; setBusy(true); status('Loading website sections…');
      try {
        if (!defaults) { const r = await fetch('./data/site-content.json'); if (!r.ok) throw Error('Could not load the original website content.'); defaults = await r.json(); }
        rows = await api('/rest/v1/site_sections?select=id,content,updated_at');
        picker.value = 'hero'; render(); status('Choose a section, edit its content, then publish when ready.');
      } catch (error) { status(error.message); } finally { setBusy(false); }
    }
  };
}
