import { createChangeTracker } from './form-changes.js';
export function generateResetPassword() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return 'Fg9!' + [...crypto.getRandomValues(new Uint8Array(24))].map(n => alphabet[n & 63]).join('');
}
export function createAccountEditor({ api, status, signOut }) {
  const $ = s => document.querySelector(s), form = $('#account-form');
  let current, actorId, page = 1, busy = false;
  let generated = '';
  function hideReset() { generated = ''; $('#account-reset-password').value = ''; $('#account-reset-result').hidden = true; }
  function showReset(password, message) { $('#account-reset-password').value = password; $('#account-reset-message').textContent = message; $('#account-reset-result').hidden = false; }
  $('#account-reset-dismiss').onclick = hideReset;
  $('#account-generate-password').onclick = () => {
    if (!current || busy) return;
    generated = generateResetPassword(); form.elements.password.value = generated; form.elements.confirmPassword.value = generated;
    showReset(generated, 'Not saved yet. Save account changes to activate this password.');
  };
  form.addEventListener('input', event => { if (['password', 'confirmPassword'].includes(event.target.name)) hideReset(); });
  const changes = createChangeTracker(form, { exclude: ['currentPassword'] });
  function setBusy(value) {
    busy = value;
    for (const n of $('#account-workspace').querySelectorAll('button,input')) n.disabled = value;
  }
  async function load(nextPage = 1) {
    if (changes.hasChanges() && !confirm('Discard your unsaved account changes?')) return;
    setBusy(true); hideReset(); form.reset(); form.hidden = true; changes.clear(); current = null;
    status('Loading user accounts…');
    try {
      const result = await api('/functions/v1/manage-accounts', { method: 'POST', body: JSON.stringify({ action: 'list', page: nextPage }) });
      actorId = result.actorId; page = result.page; $('#account-users').replaceChildren();
      for (const user of result.users) {
        const row = document.createElement('div'); row.className = 'location';
        const name = document.createElement('strong'); name.textContent = `${user.email || '(no email)'}${user.id === actorId ? ' (you)' : ''}`;
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit account';
        edit.onclick = () => {
          if (changes.hasChanges() && !confirm('Discard your unsaved account changes?')) return;
          current = user; hideReset(); form.reset(); changes.clear();
          $('#account-title').textContent = `Edit ${user.email || 'account'}`;
          form.elements.email.value = user.email; form.hidden = false; changes.markSaved(); form.elements.email.focus();
        };
        row.append(name, edit); $('#account-users').append(row);
      }
      $('#account-previous').hidden = page === 1; $('#account-next').hidden = !result.hasMore;
      status('Only your account can manage these users. Changes take effect without an email verification step.');
    } catch (e) { status(e.message); } finally { setBusy(false); }
  }
  $('#account-previous').onclick = () => load(page - 1);
  $('#account-next').onclick = () => load(page + 1);
  form.onsubmit = async e => {
    e.preventDefault(); if (!current || busy) return;
    const email = form.elements.email.value.trim(), password = form.elements.password.value;
    const resetPassword = generated && generated === password ? password : '';
    const targetEmail = current.email;
    if (password && (password.length < 12 || password.length > 128)) { status('Use a password between 12 and 128 characters.'); return; }
    if (password !== form.elements.confirmPassword.value) { status('The new passwords do not match.'); return; }
    if (email === current.email && !password) { status('Enter a different email address or a new password.'); return; }
    const body = { action: 'update', userId: current.id, currentPassword: form.elements.currentPassword.value,
      ...(email !== current.email ? { email } : {}), ...(password ? { password } : {}) };
    setBusy(true); status('Updating account…');
    try {
      const result = await api('/functions/v1/manage-accounts', { method: 'POST', body: JSON.stringify(body) });
      changes.clear(); form.reset(); form.hidden = true;
      if (result.signInAgain) { signOut('Your account was updated. Sign in again with your new details.'); return; }
      await load(page); status('Account updated. This user must sign in again with the new details.');
      if (resetPassword) showReset(resetPassword, `Password reset for ${targetEmail}. Share it privately with this user and ask them to choose their own password in Account details. This password is not saved in the panel.`);
    } catch (error) {
      if (error.signInAgain) { changes.clear(); signOut(error.message); } else status(error.message);
    } finally {
      form.elements.password.value = ''; form.elements.confirmPassword.value = ''; form.elements.currentPassword.value = '';
      setBusy(false);
    }
  };
  return { load, isBusy: () => busy, hasChanges: changes.hasChanges,
    clear() { current = null; hideReset(); changes.clear(); form.reset(); form.hidden = true; $('#account-users').replaceChildren(); } };
}
