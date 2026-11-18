import { createChangeTracker } from './form-changes.js';
import { createAccountEditor } from './admin-accounts.js';
import { createSectionEditor } from './admin-sections.js';
import { supabaseUrl, supabaseKey } from './supabase-config.js';
import { days, validateMarket, londonClock } from './market-data.js';

const $ = s => document.querySelector(s);
const form = $('#editor');
let token, current, locations = [];
const marketChanges = createChangeTracker(form);
const status = text => { $('#status').textContent = text; };
function setPasswordVisible(visible) {
  $('#login-password').type = visible ? 'text' : 'password';
  const label = visible ? 'Hide password' : 'Show password';
  $('#toggle-password').setAttribute('aria-label', label);
  $('#toggle-password').title = label;
  $('#toggle-password .eye-slash').toggleAttribute('hidden', !visible);
}
$('#toggle-password').onclick = () => setPasswordVisible($('#login-password').type === 'password');
async function api(path, options = {}) {
  const r = await fetch(`${supabaseUrl}${path}`, { ...options, headers: { apikey: supabaseKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    if (path.startsWith('/functions/v1/manage-accounts')) {
      const payload = await r.json().catch(() => ({}));
      const error = new Error(r.status === 404 ? 'User accounts needs server setup. Deploy the manage-accounts function in Supabase.' : payload.error || 'Account request failed. Please try again.');
      error.signInAgain = payload.signInAgain === true; throw error;
    }
    if (r.status === 401) { const error = new Error('Your session has expired. Sign in again.'); error.httpStatus = 401; throw error; }
    if (r.status === 404 || r.status === 400 && path.startsWith('/storage/')) throw Error('This feature needs database setup. For website sections and image uploads, run 003-site-sections.sql in Supabase.');
    throw Error('Request failed. Check your connection, account permissions and database setup, then try again.');
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
const contentEditor = createSectionEditor({ api, status });
const accountEditor = createAccountEditor({ api, status, signOut: forceSignOut });
function safeToClose() {
  if (contentEditor.isBusy() || accountEditor.isBusy()) { status('Please wait for publishing or uploading to finish.'); return false; }
  return !(marketChanges.hasChanges() || contentEditor.hasChanges() || accountEditor.hasChanges()) || confirm('Discard your unsaved changes?');
}
function clearEditor() { form.hidden = true; marketChanges.clear(); current = null; }
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
  row.querySelector('button').onclick = () => { row.remove(); };
  $('#schedule').append(row);
}
function open(m = null) {
  current = m; form.reset(); $('#schedule').replaceChildren();
  $('#editor-title').textContent = m ? 'Edit location' : 'Add location';
  for (const key of ['name', 'postcode', 'address', 'description', 'color', 'sort_order']) if (m) form.elements[key].value = m[key];
  form.elements.published.checked = m?.published || false;
  form.elements.expiry.value = m?.expires_at ? londonClock(new Date(new Date(m.expires_at).getTime() - 1)).slice(0, 10) : '';
  for (const row of m?.schedule || []) addRow(row);
  $('#delete').hidden = !m; form.hidden = false; marketChanges.markSaved();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.elements.name.focus();
}
function expiryAfter(date) {
  if (!date) return null;
  const guess = new Date(`${date}T00:00:00Z`); guess.setUTCDate(guess.getUTCDate() + 1);
  const offset = Date.parse(`${londonClock(guess)}:00Z`) - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}
$('#login').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); button.disabled = true; setPasswordVisible(false); status('Signing in…');
  try {
    const result = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: event.target.elements.email.value.trim(), password: event.target.elements.password.value }) });
    token = result.access_token; event.target.elements.password.value = '';
    const approved = await api(`/rest/v1/market_editors?select=user_id&user_id=eq.${encodeURIComponent(result.user.id)}`);
    if (!approved.length) { token = null; throw Error('This account has not been approved as a Fiesta editor. Ask the project owner to add it.'); }
    await load();
    $('#show-accounts').hidden = true;
    try { $('#show-accounts').hidden = await api('/rest/v1/rpc/fiesta_can_manage_accounts', { method: 'POST', body: '{}' }) !== true; } catch { /* Existing editing works before account setup. */ }
    $('#account-workspace').hidden = true; $('#show-accounts').setAttribute('aria-pressed', 'false');
    $('#market-workspace').hidden = false; $('#content-workspace').hidden = true; $('#show-markets').setAttribute('aria-pressed', 'true'); $('#show-content').setAttribute('aria-pressed', 'false'); $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; status('Signed in. Select a location or add a new one.');
  } catch (e) { token = null; status(e.message); } finally { button.disabled = false; }
};
$('#logout').onclick = async () => {
  if (!safeToClose()) return;
  try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* Clear local access even if offline. */ }
  forceSignOut('Signed out.');
};
$('#new').onclick = () => { if (safeToClose()) open(); };
$('#cancel').onclick = () => { if (safeToClose()) clearEditor(); };
$('#add-date').onclick = () => { addRow({ date: '', start: '11:30', end: '14:30' }); };
window.addEventListener('beforeunload', e => { if (marketChanges.hasChanges() || contentEditor.hasChanges() || accountEditor.hasChanges()) { e.preventDefault(); e.returnValue = ''; } });
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
    marketChanges.markSaved(); current = result[0];
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

function forceSignOut(message) {
  token = null; locations = []; contentEditor.clear(); accountEditor.clear(); clearEditor();
  $('#locations').replaceChildren(); $('#workspace').hidden = true; $('#logout').hidden = true; $('#login').hidden = false;
  $('#show-accounts').hidden = true; $('#login').elements.password.value = ''; status(message);
}
async function changeArea(area) {
  if (!safeToClose()) return;
  clearEditor(); contentEditor.clear(); accountEditor.clear();
  $('#market-workspace').hidden = area !== 'markets'; $('#content-workspace').hidden = area !== 'content'; $('#account-workspace').hidden = area !== 'accounts';
  for (const name of ['markets','content','accounts']) $('#show-' + name).setAttribute('aria-pressed', String(area === name));
  if (area === 'content') await contentEditor.load();
  else if (area === 'accounts') await accountEditor.load();
  else status('Select a location or add a new one.');
}
$('#show-markets').onclick = () => changeArea('markets');
$('#show-content').onclick = () => changeArea('content');
$('#show-accounts').onclick = () => changeArea('accounts');
async function checkSession() {
  if (!token || document.hidden) return;
  const checkedToken = token;
  try {
    const valid = await api('/rest/v1/rpc/fiesta_session_valid', { method: 'POST', body: '{}' });
    if (token === checkedToken && valid === false) forceSignOut('Your account or session changed. Sign in again to continue.');
  } catch (error) {
    if (token === checkedToken && error.httpStatus === 401) forceSignOut('Your session has ended. Sign in again to continue.');
    // Network failure or an unapplied migration does not discard unsaved work. RLS still guards writes.
  }
}
setInterval(checkSession, 30000);
document.addEventListener('visibilitychange', checkSession);
