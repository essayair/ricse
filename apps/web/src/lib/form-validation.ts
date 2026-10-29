export type FieldErrors = Record<string, string>;

export function focusInvalidField(key: string) {
  if (!key || typeof document === 'undefined') return;
  const field = Array.from(document.querySelectorAll<HTMLElement>('[data-validation-field]'))
    .find(element => element.dataset.validationField === key);
  if (!field) return;
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const control = field.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button');
  window.setTimeout(() => {
    if (control && control.offsetParent !== null) control.focus({ preventScroll: true });
    else { field.tabIndex = -1; field.focus({ preventScroll: true }); }
  }, 250);
}
