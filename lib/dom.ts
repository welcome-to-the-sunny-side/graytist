// Shared DOM helpers: an idempotency marker and a debounced "run on load + on
// mutations" driver. Codeforces is mostly server-rendered, but the sidebar and
// comments can lazy-load, so feature passes re-run on DOM changes. Passes MUST be
// idempotent — `markProcessed` / `isProcessed` keep them from redoing finished work
// (and from reacting to their own mutations).

const PROCESSED_ATTR = 'data-graytist';

export function markProcessed(el: Element, value = 'done'): void {
  el.setAttribute(PROCESSED_ATTR, value);
}

export function isProcessed(el: Element): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export interface ObserveOptions {
  debounceMs?: number;
  signal?: AbortSignal;
}

/**
 * Run `pass` once now, then again (debounced) on any DOM mutation until aborted.
 * Returns a disposer.
 */
export function observeDom(pass: () => void, opts: ObserveOptions = {}): () => void {
  const debounceMs = opts.debounceMs ?? 150;
  let timer: number | undefined;

  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(pass, debounceMs) as unknown as number;
  };

  pass(); // initial

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const dispose = () => {
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
  };
  opts.signal?.addEventListener('abort', dispose);
  return dispose;
}
