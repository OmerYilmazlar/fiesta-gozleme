// Server-only Edge Function. Never copy this file or server keys into the Pages build.
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createHandler({ url, serverKey, fetchImpl = fetch }) {
  return async request => {
    const origin = request.headers.get('Origin');
    const allowed = ['https://fiestagozleme.com', 'https://www.fiestagozleme.com', 'https://omeryilmazlar.github.io', 'http://127.0.0.1:8000', 'http://localhost:8000'];
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.includes(origin)) return reply(403, { error: 'Origin not allowed.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (!url || !serverKey) return reply(503, { error: 'Account management is not configured yet.' });
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!jwt) return reply(401, { error: 'Sign in again.' });
    let invalidated = false, target, actor;
    const call = async (path, { method = 'GET', body, bearer = serverKey } = {}) => {
      const response = await fetchImpl(`${url}${path}`, { method, headers: { apikey: serverKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
      const text = await response.text();
      let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: response.ok, status: response.status, data };
    };
    const rpc = (name, body) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body });
    try {
      // Supabase verifies the user's token before any claims are read or privileges used.
      const identity = await call('/auth/v1/user', { bearer: jwt });
      if (!identity.ok || !uuid.test(identity.data?.id || '')) return reply(401, { error: 'Sign in again.' });
      actor = identity.data;
      let claims; try { claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return reply(401, { error: 'Sign in again.' }); }
      if (!uuid.test(claims.session_id || '')) return reply(401, { error: 'Sign in again.' });
      const raw = await request.text();
      if (raw.length > 4096) return reply(413, { error: 'Request too large.' });
      let input; try { input = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid request.' }); }
      const selfChange = input?.action === 'change_password';
      const permission = await rpc(selfChange ? 'fiesta_editor_access' : 'fiesta_manager_access', { p_user: actor.id, p_session: claims.session_id });
      if (!permission.ok) return reply(503, { error: 'Account setup is incomplete. Please contact the website owner.' });
      if (permission.data !== true) return reply(403, { error: selfChange ? 'Your editor access or session is no longer valid. Sign in again.' : 'Only the account owner can manage users. Sign in again if your account was changed.' });
      if (input?.action === 'list') {
        const page = Number.isInteger(input.page) && input.page > 0 && input.page <= 1000 ? input.page : 1;
        const users = await call(`/auth/v1/admin/users?page=${page}&per_page=50`);
        if (!users.ok || !Array.isArray(users.data?.users)) throw Error('list');
        return reply(200, { users: users.data.users.map(u => ({ id: u.id, email: u.email || '' })), page, hasMore: users.data.users.length === 50, actorId: actor.id });
      }
      if (selfChange) {
        if (input.userId !== undefined || input.email !== undefined) return reply(400, { error: 'Account details can change only your own password.' });
        if (typeof input.password !== 'string' || input.password !== input.confirmPassword) return reply(400, { error: 'The new passwords do not match.' });
        if (input.password === input.currentPassword) return reply(400, { error: 'Choose a different new password.' });
        target = actor.id;
      } else {
        if (input?.action !== 'update' || !uuid.test(input.userId || '')) return reply(400, { error: 'Select a valid user.' });
        target = input.userId;
      }
      if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 1024) return reply(400, { error: 'Enter your current password to confirm this change.' });
      const updates = {};
      if (input.email !== undefined) {
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return reply(400, { error: 'Enter a valid email address.' });
        updates.email = input.email.trim(); updates.email_confirm = true;
      }
      if (input.password !== undefined) {
        if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) return reply(400, { error: 'Use a password between 12 and 128 characters.' });
        updates.password = input.password;
      }
      if (!Object.keys(updates).length) return reply(400, { error: 'Enter a new email or password.' });
      const attempt = await rpc('fiesta_account_attempt', { p_user: actor.id });
      if (!attempt.ok) throw Error('limit');
      if (attempt.data !== true) return reply(429, { error: 'Too many attempts. Please wait 15 minutes.' });
      const check = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: actor.email, password: input.currentPassword } });
      if (!check.ok || check.data?.user?.id !== actor.id) return reply(403, { error: 'Your current password was not accepted.' });
      // Dispose of the temporary reauthentication session; never return its tokens.
      try { await call('/auth/v1/logout?scope=local', { method: 'POST', bearer: check.data.access_token }); } catch { /* Credential change also cuts off the owner's old sessions when editing self. */ }
      const existing = await call(`/auth/v1/admin/users/${target}`);
      if (!existing.ok) return reply(404, { error: 'User not found.' });
      const revoke = await rpc('fiesta_invalidate_sessions', { p_target: target });
      if (!revoke.ok) throw Error('revoke');
      invalidated = true;
      const updated = await call(`/auth/v1/admin/users/${target}`, { method: 'PUT', body: updates });
      if (!updated.ok) return reply(400, { error: 'The change was rejected. The email may already be in use, or the password may not meet the project requirements. The affected user may need to sign in again with their previous details.', signInAgain: target === actor.id });
      // Also reject sessions opened during the update, so only a fresh login afterwards works.
      const finish = await rpc('fiesta_invalidate_sessions', { p_target: target });
      if (!finish.ok) return reply(503, { error: 'Credentials were updated, but the final session check failed. Sign in with the new details and check the account.', signInAgain: target === actor.id });
      return reply(200, { updated: true, signInAgain: target === actor.id });
    } catch {
      return reply(503, { error: 'The account request could not be completed. Check the account before retrying; a timed-out change may have succeeded.', signInAgain: invalidated && target === actor?.id });
    }
  };
}
if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({ url: Deno.env.get('SUPABASE_URL'), serverKey: Deno.env.get('FIESTA_AUTH_ADMIN_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }));
}
