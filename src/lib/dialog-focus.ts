export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.tabIndex < 0) return false;
    return element.getClientRects().length > 0;
  });
}

export function nextFocusIndex(currentIndex: number, total: number, shift: boolean): number {
  if (total <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= total) return shift ? total - 1 : 0;
  return shift ? (currentIndex - 1 + total) % total : (currentIndex + 1) % total;
}
