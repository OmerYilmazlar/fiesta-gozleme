// Track changed values rather than input events: autofill and programmatic
// events on hidden/reset forms are not unsaved edits.
export function createChangeTracker(form, { read, exclude = [] } = {}) {
  let baseline = null;
  const values = read || (() => [...form.querySelectorAll('input,textarea,select')]
    .filter(n => !exclude.includes(n.name) && !['file', 'submit', 'button'].includes(n.type))
    .map(n => [n.name || n.className, ['checkbox', 'radio'].includes(n.type) ? n.checked : n.value]));
  const snapshot = () => JSON.stringify(values());
  return {
    markSaved() { baseline = snapshot(); },
    clear() { baseline = null; },
    hasChanges() { return baseline !== null && !form.closest('[hidden]') && snapshot() !== baseline; }
  };
}
