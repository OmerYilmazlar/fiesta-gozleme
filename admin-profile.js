import { createChangeTracker } from './form-changes.js';

export function createProfileEditor({ api, status, signOut }) {
  const form = document.querySelector('#profile-form'), toggle = document.querySelector('#profile-show-passwords');
  const changes = createChangeTracker(form, { exclude: ['currentPassword'] });
  let busy = false;
  function clear() {
    form.reset(); changes.clear();
    for (const input of form.querySelectorAll('input')) input.type = 'password';
    toggle.setAttribute('aria-pressed', 'false');
  }
  toggle.onclick = () => {
    const show = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(show));
    for (const input of form.querySelectorAll('input')) input.type = show ? 'text' : 'password';
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    const { currentPassword, password, confirmPassword } = form.elements;
    if (password.value.length < 12 || password.value.length > 128) { status('Use a password between 12 and 128 characters.'); return; }
    if (password.value !== confirmPassword.value) { status('The new passwords do not match.'); return; }
    if (!currentPassword.value) { status('Enter your current password.'); return; }
    if (password.value === currentPassword.value) { status('Choose a different new password.'); return; }
    const body = { action: 'change_password', currentPassword: currentPassword.value, password: password.value, confirmPassword: confirmPassword.value };
    busy = true; for (const n of form.querySelectorAll('input,button')) n.disabled = true;
    status('Changing your password…');
    try {
      await api('/functions/v1/manage-accounts', { method: 'POST', body: JSON.stringify(body) });
      clear(); signOut('Password changed. Sign in again with your new password.');
    } catch (error) {
      if (error.signInAgain) { clear(); signOut(error.message); } else status(error.message);
    } finally {
      currentPassword.value = ''; busy = false;
      for (const n of form.querySelectorAll('input,button')) n.disabled = false;
    }
  };
  return { clear, hasChanges: changes.hasChanges, isBusy: () => busy,
    load() { clear(); changes.markSaved(); status('Change your own password. No email verification is needed; you will sign in again afterwards.'); } };
}
