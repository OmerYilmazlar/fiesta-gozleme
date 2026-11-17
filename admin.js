import { supabaseUrl, supabaseKey } from './supabase-config.js';
import { days, validateMarket, londonClock } from './market-data.js';

const $ = s => document.querySelector(s);
const form = $('#editor');
let token, current, locations = [], dirty = false;
const status = text => { $('#status').textContent = text; };
async function api(path, options = {}) {
  const r = await fetch(`${supabaseUrl}${path}`, { ...options, headers: { apikey: supabaseKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    if (r.status === 401) throw Error('Your session has expired. Copy any unsaved changes, then sign out and sign in again.');
    if (r.status === 404) throw Error('The market database is not set up yet. Run the supplied SQL setup file in Supabase.');
    throw Error('Request failed. Check your connection, account permissions and database setup, then try again.');
  }
  return r.status === 204 ? null : r.json();
}
function safeToClose() { return !dirty || confirm('Discard your unsaved changes?'); }
function clearEditor() { form.hidden = true; dirty = false; current = null; }
async function load() {
  locations = await api('/rest/v1/markets?select=*&order=sort_order.asc,name.asc');
  $('#locations').replaceChildren();
  for (const m of locations) {
    const row = document.createElement('div'); row.className = 'location';
    const text = document.createElement('div'), title = document.createElement('h3'), detail = document.createElement('p');
    title.textContent = m.name;
    detail.textContent = `${m.published ? 'Published' : 'Draft'} · ${m.postcode} · ${m.schedule.length} dates / weekly hours${m.expires_at && new Date(m.expires_at) <= new Date() ? ' · Expired' : ''}`;
    text.append(title, detail);
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.onclick = () => { if (safeToClose()) open(m); };
    row.append(text, edit); $('#locations').append(row);
  }
}
function addRow(r = { date: '', day: 'Monday', start: '11:30', end: '14:30' }) {
  const row = document.createElement('div'); row.className = 'schedule-row';
  // Fixed markup only. All database content is assigned through input values/textContent.
  row.innerHTML = '<label>Schedule<select class="kind"><option value="date">Specific date</option><option value="weekly">Every week</option></select></label><label class="when-label">Date<input class="date" type="date"><select class="day"></select></label><label>Opens<input class="start" type="time" required></label><label>Closes<input class="end" type="time" required></label><button type="button" class="secondary">Remove</button>';
  for (const day of days) { const o = document.createElement('option'); o.textContent = day; row.querySelector('.day').append(o); }
  const kind = row.querySelector('.kind'), date = row.querySelector('.date'), day = row.querySelector('.day');
  kind.value = r.date || !r.day ? 'date' : 'weekly'; date.value = r.date || ''; day.value = r.day || 'Monday';
  const mode = () => { date.hidden = kind.value !== 'date'; date.required = !date.hidden; day.hidden = !date.hidden; };
  kind.onchange = mode; mode();
  row.querySelector('.start').value = r.start; row.querySelector('.end').value = r.end;
  row.querySelector('button').onclick = () => { row.remove(); dirty = true; };
  $('#schedule').append(row);
}
function open(m = null) {
  current = m; form.reset(); $('#schedule').replaceChildren();
  $('#editor-title').textContent = m ? 'Edit location' : 'Add location';
  for (const key of ['name', 'postcode', 'address', 'description', 'color', 'sort_order']) if (m) form.elements[key].value = m[key];
  form.elements.published.checked = m?.published || false;
  form.elements.expiry.value = m?.expires_at ? londonClock(new Date(new Date(m.expires_at).getTime() - 1)).slice(0, 10) : '';
  for (const row of m?.schedule || []) addRow(row);
  $('#delete').hidden = !m; form.hidden = false; dirty = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.elements.name.focus();
}
function expiryAfter(date) {
  if (!date) return null;
  const guess = new Date(`${date}T00:00:00Z`); guess.setUTCDate(guess.getUTCDate() + 1);
  const offset = Date.parse(`${londonClock(guess)}:00Z`) - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}
$('#login').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; status('Signing in…');
  try {
    const result = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: event.target.elements.email.value.trim(), password: event.target.elements.password.value }) });
    token = result.access_token; event.target.elements.password.value = '';
    const approved = await api(`/rest/v1/market_editors?select=user_id&user_id=eq.${encodeURIComponent(result.user.id)}`);
    if (!approved.length) { token = null; throw Error('This account has not been approved as a Fiesta editor. Ask the project owner to add it.'); }
    await load(); $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; status('Signed in. Select a location or add a new one.');
  } catch (e) { token = null; status(e.message); } finally { button.disabled = false; }
};
$('#logout').onclick = async () => {
  if (!safeToClose()) return;
  try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* Clear local access even if offline. */ }
  token = null; locations = []; clearEditor(); $('#locations').replaceChildren(); $('#workspace').hidden = true; $('#logout').hidden = true; $('#login').hidden = false; status('Signed out.');
};
$('#new').onclick = () => { if (safeToClose()) open(); };
$('#cancel').onclick = () => { if (safeToClose()) clearEditor(); };
$('#add-date').onclick = () => { addRow({ date: '', start: '11:30', end: '14:30' }); dirty = true; };
form.oninput = () => { dirty = true; };
form.onchange = () => { dirty = true; };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
form.onsubmit = async event => {
  event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    const m = { name: values.name.trim(), address: values.address.trim(), postcode: values.postcode.trim(), description: values.description.trim(), color: values.color, sort_order: Number(values.sort_order), published: form.elements.published.checked, expires_at: expiryAfter(values.expiry), schedule: [...$('#schedule').children].map(row => ({ ...(row.querySelector('.kind').value === 'date' ? { date: row.querySelector('.date').value } : { day: row.querySelector('.day').value }), start: row.querySelector('.start').value, end: row.querySelector('.end').value })) };
    validateMarket(m);
    if (m.published && !m.schedule.length) throw Error('Add at least one trading date before publishing.');
    const filter = current ? `?id=eq.${current.id}&updated_at=eq.${encodeURIComponent(current.updated_at)}` : '';
    const result = await api(`/rest/v1/markets${filter}`, { method: current ? 'PATCH' : 'POST', body: JSON.stringify(m) });
    if (!result.length) throw Error('This location changed in another session. Copy your edits and reopen it before saving.');
    dirty = false; current = result[0];
    await load(); clearEditor(); status('Saved. Published changes appear on the website within a minute or on refresh.');
  } catch (e) { status(e.message); } finally { button.disabled = false; }
};
$('#delete').onclick = async () => {
  if (!current || !confirm(`Delete ${current.name}? This cannot be undone.`)) return;
  const button = $('#delete'); button.disabled = true;
  try {
    const result = await api(`/rest/v1/markets?id=eq.${current.id}&updated_at=eq.${encodeURIComponent(current.updated_at)}`, { method: 'DELETE' });
    if (!result.length) throw Error('This location changed in another session. Reopen it before deleting.');
    clearEditor(); await load(); status('Location deleted.');
  } catch (e) { status(e.message); } finally { button.disabled = false; }
};
