export function createAccountEditor({ api, status, signOut }) {
  const $ = s => document.querySelector(s), form = $('#account-form');
  let current, actorId, page = 1, dirty = false, busy = false;
  function setBusy(value) {
    busy = value;
    for (const n of $('#account-workspace').querySelectorAll('button,input')) n.disabled = value;
  }
  async function load(nextPage = 1) {
    if (dirty && !confirm('Discard your unsaved account changes?')) return;
    setBusy(true); form.reset(); form.hidden = true; dirty = false; current = null;
    status('Loading user accounts…');
    try {
      const result = await api('/functions/v1/manage-accounts', { method: 'POST', body: JSON.stringify({ action: 'list', page: nextPage }) });
      actorId = result.actorId; page = result.page; $('#account-users').replaceChildren();
      for (const user of result.users) {
        const row = document.createElement('div'); row.className = 'location';
        const name = document.createElement('strong'); name.textContent = `${user.email || '(no email)'}${user.id === actorId ? ' (you)' : ''}`;
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit account';
        edit.onclick = () => {
          if (dirty && !confirm('Discard your unsaved account changes?')) return;
          current = user; form.reset(); dirty = false;
          $('#account-title').textContent = `Edit ${user.email || 'account'}`;
          form.elements.email.value = user.email; form.hidden = false; form.elements.email.focus();
        };
        row.append(name, edit); $('#account-users').append(row);
      }
      $('#account-previous').hidden = page === 1; $('#account-next').hidden = !result.hasMore;
      status('Only your account can manage these users. Changes take effect without an email verification step.');
    } catch (e) { status(e.message); } finally { setBusy(false); }
  }
  form.oninput = () => { dirty = true; };
  $('#account-previous').onclick = () => load(page - 1);
  $('#account-next').onclick = () => load(page + 1);
  form.onsubmit = async e => {
    e.preventDefault(); if (!current || busy) return;
    const email = form.elements.email.value.trim(), password = form.elements.password.value;
    if (password !== form.elements.confirmPassword.value) { status('The new passwords do not match.'); return; }
    if (email === current.email && !password) { status('Enter a different email address or a new password.'); return; }
    const body = { action: 'update', userId: current.id, currentPassword: form.elements.currentPassword.value,
      ...(email !== current.email ? { email } : {}), ...(password ? { password } : {}) };
    setBusy(true); status('Updating account…');
    try {
      const result = await api('/functions/v1/manage-accounts', { method: 'POST', body: JSON.stringify(body) });
      dirty = false; form.reset(); form.hidden = true;
      if (result.signInAgain) { signOut('Your account was updated. Sign in again with your new details.'); return; }
      await load(page); status('Account updated. This user must sign in again with the new details.');
    } catch (error) {
      if (error.signInAgain) { dirty = false; signOut(error.message); } else status(error.message);
    } finally {
      form.elements.password.value = ''; form.elements.confirmPassword.value = ''; form.elements.currentPassword.value = '';
      setBusy(false);
    }
  };
  return { load, isBusy: () => busy, hasChanges: () => dirty,
    clear() { current = null; dirty = false; form.reset(); form.hidden = true; $('#account-users').replaceChildren(); } };
}
