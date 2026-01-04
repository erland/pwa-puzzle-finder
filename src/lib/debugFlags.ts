/**
 * Parse debug flags in a way that works with HashRouter.
 *
 * Supports:
 *  - ?debug=1#/
 *  - #/?debug=1
 */
export function isDebugEnabled(): boolean {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('debug');
    if (fromSearch != null) return fromSearch === '1' || fromSearch === 'true';

    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    if (q >= 0) {
      const fromHash = new URLSearchParams(hash.slice(q + 1)).get('debug');
      if (fromHash != null) return fromHash === '1' || fromHash === 'true';
    }
  } catch {
    // ignore
  }
  return false;
}
