import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/manage-accounts/index.js';
import { createChangeTracker } from '../form-changes.js';
import { createAccountEditor, generateResetPassword } from '../admin-accounts.js';
import { createProfileEditor } from '../admin-profile.js';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
const owner = 'b9168623-38f2-49a4-b835-6fe51ea0d098', other = '11111111-1111-4111-8111-111111111111', session = '22222222-2222-4222-8222-222222222222';
const jwt = `header.${Buffer.from(JSON.stringify({ session_id: session })).toString('base64url')}.signature`;
function setup({ manager = true, editor = true, actorId = owner, valid = true, reauth = true, limited = false, rejectUpdate = false, member = true, membershipFailure = false } = {}) {
  const calls = [];
  const handler = createHandler({ url: 'https://fixture.supabase.co', serverKey: 'SERVER_ONLY_TEST_KEY', fetchImpl: async (url, options) => {
    const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, body });
    let data = null, status = 200;
    if (path === '/auth/v1/user') { data = { id: actorId, email: 'actor@example.com' }; if (!valid) status = 401; }
    else if (path.endsWith('fiesta_manager_access')) data = manager;
    else if (path.endsWith('fiesta_editor_access')) data = editor;
    else if (path.endsWith('fiesta_account_attempt')) data = !limited;
    else if (path.endsWith('fiesta_invalidate_sessions')) data = null;
    else if (path === '/auth/v1/token') { data = { access_token: 'temporary-token', user: { id: reauth ? actorId : 'wrong-user' } }; if (!reauth) status = 400; }
    else if (path === '/auth/v1/logout') data = null;
    else if (path === '/rest/v1/market_editors') {
      const target = new URL(url).searchParams.get('user_id')?.slice(3);
      data = target ? (member ? [{ user_id: target }] : []) : [{ user_id: owner }];
      if (membershipFailure) status = 500;
    }
    else if (path === '/auth/v1/admin/users') throw Error('Shared Auth directory must never be listed');
    else if (path.startsWith('/auth/v1/admin/users/')) { data = { id: path.split('/').pop(), email: 'owner@example.com', secret_metadata: 'must-not-leak' }; if (options.method === 'PUT' && rejectUpdate) status = 422; }
    else throw Error(`Unexpected path ${path}`);
    return new Response(JSON.stringify(data), { status });
  } });
  const request = (body, auth = jwt, origin = 'https://omeryilmazlar.github.io') => handler(new Request('https://fixture/functions/v1/manage-accounts', { method: 'POST', headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), Origin: origin }, body: JSON.stringify(body) }));
  return { calls, request, handler };
}
test('custom-domain CORS preflight and authenticated responses use the correct origin', async () => {
  for (const origin of ['https://fiestagozleme.com', 'https://www.fiestagozleme.com', 'https://omeryilmazlar.github.io']) {
    const { handler, calls, request } = setup();
    const preflight = await handler(new Request('https://fixture/functions/v1/manage-accounts', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,authorization,content-type,prefer' } }));
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(calls.length, 0);
    const response = await request({ action: 'list' }, jwt, origin);
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const { handler, calls } = setup();
  assert.equal((await handler(new Request('https://fixture/functions/v1/manage-accounts', { method: 'OPTIONS', headers: { Origin: 'https://fiestagozleme.com.evil.example' } }))).status, 403);
  assert.equal(calls.length, 0);
});
test('change tracking ignores hidden forms, current-password autofill, and unchanged/reverted fields', () => {
  const { document } = parseHTML('<section><form hidden><input name="email" value="owner@example.com"><input name="currentPassword" type="password"><input name="password" type="password"></form></section>');
  const form = document.querySelector('form'), email = form.querySelector('[name=email]');
  const tracker = createChangeTracker(form, { exclude: ['currentPassword'] });
  tracker.markSaved(); email.value = 'autofill@example.com';
  assert.equal(tracker.hasChanges(), false);
  form.hidden = false; email.value = 'owner@example.com'; tracker.markSaved();
  form.querySelector('[name=currentPassword]').value = 'browser-autofilled';
  assert.equal(tracker.hasChanges(), false);
  email.value = 'new@example.com'; assert.equal(tracker.hasChanges(), true);
  email.value = 'owner@example.com'; assert.equal(tracker.hasChanges(), false);
  form.querySelector('[name=password]').value = 'new-password'; assert.equal(tracker.hasChanges(), true);
  document.querySelector('section').hidden = true; assert.equal(tracker.hasChanges(), false);
  tracker.clear(); document.querySelector('section').hidden = false; assert.equal(tracker.hasChanges(), false);
});
test('schedule row additions and checkbox edits are tracked and clear when reverted', () => {
  const { document } = parseHTML('<form><input name="name" value="Market"><input name="published" type="checkbox"></form>');
  const form = document.querySelector('form'), checkbox = form.querySelector('[type=checkbox]'); checkbox.checked = false;
  const tracker = createChangeTracker(form); tracker.markSaved();
  checkbox.checked = true; assert.equal(tracker.hasChanges(), true);
  checkbox.checked = false; assert.equal(tracker.hasChanges(), false);
  const row = document.createElement('input'); row.value = '12:00'; form.append(row);
  assert.equal(tracker.hasChanges(), true); row.remove(); assert.equal(tracker.hasChanges(), false);
});
test('failed account loading followed by hidden password autofill has no unsaved changes', async () => {
  const { document, window } = parseHTML(await readFile('admin.html', 'utf8'));
  const prior = globalThis.document; globalThis.document = document;
  try {
    const form = document.querySelector('#account-form');
    form.reset = () => { for (const n of form.querySelectorAll('input')) n.value = ''; };
    const editor = createAccountEditor({ api: async () => { throw Error('Failed to fetch'); }, status() {}, signOut() {} });
    await editor.load();
    const password = form.querySelector('[name=currentPassword]'); password.value = 'autofilled';
    password.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(form.hidden, true); assert.equal(editor.hasChanges(), false);
    assert.equal(editor.isBusy(), false);
  } finally { globalThis.document = prior; }
});
test('missing/invalid authentication and non-owner access never reach user administration', async () => {
  for (const options of [{}, { valid: false }, { manager: false }]) {
    const { calls, request } = setup(options);
    const response = await request({ action: 'list' }, Object.keys(options).length ? jwt : null);
    assert.ok([401, 403].includes(response.status));
    assert.equal(calls.some(c => c.path.includes('/admin/users')), false);
  }
});
test('owner receives only user IDs and emails, no credentials or metadata', async () => {
  const { request } = setup(); const r = await request({ action: 'list' });
  assert.equal(r.status, 200);
  const body = await r.json(); assert.deepEqual(body.users, [{ id: owner, email: 'owner@example.com' }]);
  assert.ok(!JSON.stringify(body).includes('SERVER_ONLY_TEST_KEY'));
});
test('email updates are confirmed immediately and editing self requires sign-in again', async () => {
  const { calls, request } = setup();
  const r = await request({ action: 'update', userId: owner, email: 'new@example.com', currentPassword: 'current-private' });
  assert.equal(r.status, 200); assert.equal((await r.json()).signInAgain, true);
  assert.deepEqual(calls.find(c => c.method === 'PUT').body, { email: 'new@example.com', email_confirm: true });
  const revocations = calls.map((c, i) => c.path.endsWith('fiesta_invalidate_sessions') ? i : -1).filter(i => i >= 0);
  const update = calls.findIndex(c => c.method === 'PUT');
  assert.equal(revocations.length, 2); assert.ok(revocations[0] < update && revocations[1] > update);
});
test('owner can change another password without changing their own credentials', async () => {
  const { calls, request } = setup();
  const r = await request({ action: 'update', userId: other, password: 'new-strong-password', currentPassword: 'current-private' });
  assert.equal(r.status, 200); assert.equal((await r.json()).signInAgain, false);
  const update = calls.find(c => c.method === 'PUT'); assert.ok(update.path.endsWith(other));
  assert.deepEqual(update.body, { password: 'new-strong-password' });
  assert.ok(calls.filter(c => c.path.endsWith('fiesta_invalidate_sessions')).every(c => c.body.p_target === other));
});
test('incorrect current password and rate limits prevent changes', async () => {
  for (const options of [{ reauth: false }, { limited: true }]) {
    const { calls, request } = setup(options);
    const r = await request({ action: 'update', userId: other, email: 'new@example.com', currentPassword: 'wrong' });
    assert.ok([403, 429].includes(r.status));
    assert.ok(!calls.some(c => c.method === 'PUT' || c.path.endsWith('fiesta_invalidate_sessions')));
  }
});
test('bad fields, short passwords and unexpected origins are rejected', async () => {
  for (const fields of [{ email: 'bad-address' }, { password: 'short' }, { userId: 'not-a-uuid', email: 'new@example.com' }]) {
    const { calls, request } = setup();
    const r = await request({ action: 'update', userId: other, currentPassword: 'current', ...fields });
    assert.equal(r.status, 400); assert.ok(!calls.some(c => c.method === 'PUT'));
  }
  assert.equal((await setup().request({ action: 'list' }, jwt, 'https://evil.example')).status, 403);
});
test('rejected changes report that the owner must sign in again without leaking server errors', async () => {
  const { request } = setup({ rejectUpdate: true });
  const r = await request({ action: 'update', userId: owner, email: 'taken@example.com', currentPassword: 'private' });
  const body = await r.json(); assert.equal(r.status, 400); assert.equal(body.signInAgain, true);
  assert.ok(!JSON.stringify(body).includes('private'));
});

const selfPassword = { action: 'change_password', currentPassword: 'previous-private-password', password: 'new-private-password', confirmPassword: 'new-private-password' };
test('an approved non-owner can change only their own password and invalidate old sessions', async () => {
  const { calls, request } = setup({ manager: false, actorId: other });
  const response = await request(selfPassword), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.signInAgain, true);
  const change = calls.find(c => c.method === 'PUT');
  assert.equal(change.path, `/auth/v1/admin/users/${other}`);
  assert.deepEqual(change.body, { password: selfPassword.password });
  assert.ok(calls.filter(c => c.path.endsWith('fiesta_invalidate_sessions')).every(c => c.body.p_target === other));
  assert.equal(calls.filter(c => c.path.endsWith('fiesta_invalidate_sessions')).length, 2);
  assert.ok(!JSON.stringify(body).includes(selfPassword.password));
  assert.ok(!calls.some(c => c.path.includes('/recover') || c.path.includes('/otp')));
});

test('self-service rejects target/email injection, mismatch, short passwords, stale access and wrong old passwords', async () => {
  for (const input of [{ userId: owner }, { email: 'different@example.com' }, { confirmPassword: 'mismatch' }, { password: 'short', confirmPassword: 'short' }, { password: selfPassword.currentPassword, confirmPassword: selfPassword.currentPassword }]) {
    const { calls, request } = setup({ manager: false, actorId: other });
    assert.equal((await request({ ...selfPassword, ...input })).status, 400);
    assert.ok(!calls.some(c => c.method === 'PUT'));
  }
  for (const options of [{ editor: false }, { reauth: false }, { limited: true }]) {
    const { calls, request } = setup({ manager: false, actorId: other, ...options });
    assert.ok([403, 429].includes((await request(selfPassword)).status));
    assert.ok(!calls.some(c => c.method === 'PUT' || c.path.endsWith('fiesta_invalidate_sessions')));
  }
  const { request } = setup({ manager: false, actorId: other });
  assert.equal((await request({ action: 'update', userId: owner, password: 'new-long-password', currentPassword: 'old-password' })).status, 403);
});

function mockForm(document, selector) {
  const form = document.querySelector(selector);
  Object.defineProperty(form, 'elements', { value: Object.fromEntries([...form.querySelectorAll('input[name]')].map(input => [input.name, input])) });
  form.reset = () => { for (const input of form.querySelectorAll('input')) input.value = ''; };
  return form;
}

test('Account details validates, ignores current-password autofill, submits and clears on sign-out', async () => {
  const { document } = parseHTML(await readFile('admin.html', 'utf8')), prior = globalThis.document;
  globalThis.document = document;
  try {
    document.querySelector('#workspace').hidden = false; document.querySelector('#profile-workspace').hidden = false;
    const form = mockForm(document, '#profile-form'); let message = '', sent, signedOut = false;
    const editor = createProfileEditor({ status: value => { message = value; }, signOut: () => { signedOut = true; }, api: async (path, options) => { sent = JSON.parse(options.body); return { signInAgain: true }; } });
    editor.load(); form.elements.currentPassword.value = selfPassword.currentPassword;
    assert.equal(editor.hasChanges(), false);
    form.elements.password.value = selfPassword.password; form.elements.confirmPassword.value = 'mismatch';
    await form.onsubmit({ preventDefault() {} }); assert.match(message, /do not match/); assert.equal(sent, undefined);
    form.elements.confirmPassword.value = selfPassword.password; assert.equal(editor.hasChanges(), true);
    await form.onsubmit({ preventDefault() {} }); assert.deepEqual(sent, selfPassword);
    assert.equal(signedOut, true); assert.equal(editor.hasChanges(), false); assert.equal(form.elements.password.value, ''); assert.equal(editor.isBusy(), false);
  } finally { globalThis.document = prior; }
});

test('owner reset generates a unique password, requires explicit save and clears it when leaving', async () => {
  const first = generateResetPassword(), second = generateResetPassword();
  assert.notEqual(first, second); assert.equal(first.length, 28); assert.match(first, /[a-z]/); assert.match(first, /[A-Z]/); assert.match(first, /\d/);
  const { document } = parseHTML(await readFile('admin.html', 'utf8')), prior = globalThis.document; globalThis.document = document;
  try {
    document.querySelector('#workspace').hidden = false; document.querySelector('#account-workspace').hidden = false;
    const form = mockForm(document, '#account-form'); let update;
    const editor = createAccountEditor({ status() {}, signOut() {}, api: async (path, options) => {
      const body = JSON.parse(options.body);
      if (body.action === 'list') return { actorId: owner, users: [{ id: other, email: 'editor@example.com' }], page: 1, hasMore: false };
      update = body; return { updated: true, signInAgain: false };
    } });
    await editor.load(); document.querySelector('#account-users button').click(); document.querySelector('#account-generate-password').click();
    const generated = form.elements.password.value;
    assert.equal(update, undefined); assert.equal(form.elements.confirmPassword.value, generated); assert.equal(editor.hasChanges(), true);
    form.elements.currentPassword.value = 'owner-current-password'; await form.onsubmit({ preventDefault() {} });
    assert.equal(update.userId, other); assert.equal(update.password, generated); assert.equal(update.currentPassword, 'owner-current-password');
    assert.equal(document.querySelector('#account-reset-password').value, generated); assert.equal(document.querySelector('#account-reset-result').hidden, false);
    editor.clear(); assert.equal(document.querySelector('#account-reset-password').value, ''); assert.equal(document.querySelector('#account-reset-result').hidden, true);
  } finally { globalThis.document = prior; }
});


test('other-site target IDs and unavailable membership checks cannot change or revoke accounts', async () => {
  for (const options of [{ member: false }, { membershipFailure: true }]) {
    const { request, calls } = setup(options);
    const response = await request({ action: 'update', userId: other, password: 'new-strong-password', currentPassword: 'current-private' });
    assert.equal(response.status, options.member === false ? 403 : 503);
    assert.ok(!calls.some(c => c.path.includes('/auth/v1/admin/users') || c.path.endsWith('fiesta_invalidate_sessions')));
  }
});

test('listing reads only Fiesta member profiles and fails closed if membership is unavailable', async () => {
  const { request, calls } = setup();
  assert.equal((await request({ action: 'list' })).status, 200);
  assert.deepEqual(calls.filter(c => c.path.includes('/auth/v1/admin/users')).map(c => c.path), [`/auth/v1/admin/users/${owner}`]);
  const failed = setup({ membershipFailure: true });
  assert.equal((await failed.request({ action: 'list' })).status, 503);
  assert.ok(!failed.calls.some(c => c.path.includes('/auth/v1/admin/users')));
});
