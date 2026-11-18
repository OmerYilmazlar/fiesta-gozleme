import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/manage-accounts/index.js';
const owner = 'b9168623-38f2-49a4-b835-6fe51ea0d098', other = '11111111-1111-4111-8111-111111111111', session = '22222222-2222-4222-8222-222222222222';
const jwt = `header.${Buffer.from(JSON.stringify({ session_id: session })).toString('base64url')}.signature`;
function setup({ manager = true, valid = true, reauth = true, limited = false, rejectUpdate = false } = {}) {
  const calls = [];
  const handler = createHandler({ url: 'https://fixture.supabase.co', serverKey: 'SERVER_ONLY_TEST_KEY', fetchImpl: async (url, options) => {
    const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, body });
    let data = null, status = 200;
    if (path === '/auth/v1/user') { data = { id: owner, email: 'owner@example.com' }; if (!valid) status = 401; }
    else if (path.endsWith('fiesta_manager_access')) data = manager;
    else if (path.endsWith('fiesta_account_attempt')) data = !limited;
    else if (path.endsWith('fiesta_invalidate_sessions')) data = null;
    else if (path === '/auth/v1/token') { data = { access_token: 'temporary-token', user: { id: reauth ? owner : other } }; if (!reauth) status = 400; }
    else if (path === '/auth/v1/logout') data = null;
    else if (path === '/auth/v1/admin/users') data = { users: [{ id: owner, email: 'owner@example.com', secret_metadata: 'must-not-leak' }] };
    else if (path.startsWith('/auth/v1/admin/users/')) { data = { id: path.split('/').pop() }; if (options.method === 'PUT' && rejectUpdate) status = 422; }
    else throw Error(`Unexpected path ${path}`);
    return new Response(JSON.stringify(data), { status });
  } });
  const request = (body, auth = jwt, origin = 'https://omeryilmazlar.github.io') => handler(new Request('https://fixture/functions/v1/manage-accounts', { method: 'POST', headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), Origin: origin }, body: JSON.stringify(body) }));
  return { calls, request };
}
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
