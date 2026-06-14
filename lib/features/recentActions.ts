// Feature 1 — Recent Actions blog filtering.
//
// The sidebar "Recent actions" box (unique `div.recent-actions`) lists blogs, one per
// `<li>`: the first `a.rated-user` is the blog author, the second `a[href*="/blog/entry/"]`
// is the title. We move filtered rows into a twin box ("Filtered recent actions") cloned
// from the original chrome and inserted directly below it.
//
// A blog is filtered when its author's rank is selected OR its title matches a keyword.
//
// The pass is idempotent and reversible: at steady state it performs ZERO DOM mutations
// (the no-op guards skip redundant moves), and toggling settings re-partitions in place —
// including restoring everything when disabled.

import { classifyUserLink, RANK_BY_ID } from '@/lib/ranks';
import { isWhitelisted, matchedKeyword, normalizeHandles } from '@/lib/filter';
import type { GraytistConfig, RecentActionsSettings } from '@/lib/config';

const FILTERED_BOX_ATTR = 'data-graytist-filtered-ra';
const RA_IDX = 'data-graytist-ra-idx';

export function runRecentActions(config: GraytistConfig): void {
  const filteredBox = document.querySelector<HTMLElement>(`[${FILTERED_BOX_ATTR}]`);

  // The ORIGINAL recent-actions box = the `.recent-actions` not inside our clone.
  const origRaDiv = Array.from(document.querySelectorAll<HTMLElement>('.recent-actions')).find(
    (d) => !filteredBox || !filteredBox.contains(d),
  );
  if (!origRaDiv) {
    filteredBox?.remove(); // component gone (e.g. SPA nav) — drop the orphan twin
    return;
  }

  const origBox = origRaDiv.closest<HTMLElement>('.roundbox.sidebox');
  const origUl = origRaDiv.querySelector<HTMLElement>('ul');
  if (!origBox || !origUl) return;

  const ra = config.recentActions;
  if (!config.enabled || !ra.enabled) {
    restore(origUl, filteredBox);
    return;
  }

  const box = filteredBox ?? createFilteredBox(origBox);
  const filtUl = box.querySelector<HTMLElement>('.recent-actions ul');
  if (!filtUl) return;

  const whitelist = normalizeHandles(config.whitelist);
  const keep: HTMLElement[] = [];
  const drop: HTMLElement[] = [];
  for (const li of orderedRows(origUl, filtUl)) {
    const reason = decide(li, ra, whitelist);
    if (reason) {
      drop.push(li);
      setTooltip(li, reason);
    } else {
      keep.push(li);
      clearTooltip(li);
    }
  }

  applySequence(origUl, keep);
  applySequence(filtUl, drop);

  const display = drop.length > 0 ? '' : 'none';
  if (box.style.display !== display) box.style.display = display;
}

/** Returns a hover-tooltip reason if the row should be filtered, else null. */
function decide(li: HTMLElement, ra: RecentActionsSettings, whitelist: Set<string>): string | null {
  const authorLink = li.querySelector('a.rated-user');
  if (authorLink) {
    const { handle, rank } = classifyUserLink(authorLink);
    if (isWhitelisted(handle, whitelist)) return null; // whitelist overrides everything
    if (rank !== null && ra.filteredRanks.includes(rank)) {
      return `Filtered (${RANK_BY_ID[rank].label})`;
    }
  }
  const titleLink = li.querySelector('a[href*="/blog/entry/"]');
  const title = titleLink?.textContent?.trim() ?? '';
  const kw = matchedKeyword(title, ra.keywords);
  if (kw) return `Filtered (keyword “${kw}”)`;
  return null;
}

/**
 * All `<li>` rows from both lists, in their original order. Each row is stamped with a
 * stable index on first sight so we can restore order after moving rows between lists.
 * The sidebar is server-rendered per page load, so indices are always assigned in DOM order.
 */
function orderedRows(origUl: HTMLElement, filtUl: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const ul of [origUl, filtUl]) {
    for (const node of Array.from(ul.children)) {
      if (node.tagName === 'LI') rows.push(node as HTMLElement);
    }
  }
  let maxIdx = -1;
  for (const r of rows) {
    const v = r.getAttribute(RA_IDX);
    if (v !== null) maxIdx = Math.max(maxIdx, Number(v));
  }
  for (const r of rows) {
    if (r.getAttribute(RA_IDX) === null) r.setAttribute(RA_IDX, String(++maxIdx));
  }
  rows.sort((a, b) => Number(a.getAttribute(RA_IDX)) - Number(b.getAttribute(RA_IDX)));
  return rows;
}

function sameSequence(parent: HTMLElement, rows: HTMLElement[]): boolean {
  const kids = Array.from(parent.children).filter((c) => c.tagName === 'LI');
  if (kids.length !== rows.length) return false;
  for (let i = 0; i < rows.length; i++) {
    if (kids[i] !== rows[i]) return false;
  }
  return true;
}

/** Reorder/move rows into `parent` only if they aren't already exactly so (no-op guard). */
function applySequence(parent: HTMLElement, rows: HTMLElement[]): void {
  if (sameSequence(parent, rows)) return;
  const frag = document.createDocumentFragment();
  for (const r of rows) frag.appendChild(r);
  parent.appendChild(frag);
}

/** Clone the original box for identical chrome; retitle the caption; empty its list. */
function createFilteredBox(origBox: HTMLElement): HTMLElement {
  const clone = origBox.cloneNode(true) as HTMLElement;
  clone.setAttribute(FILTERED_BOX_ATTR, '');
  clone.removeAttribute('id');

  const caption = clone.querySelector('.caption');
  if (caption) {
    for (const node of Array.from(caption.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) {
        node.textContent = '→ Filtered recent actions';
        break;
      }
    }
  }

  clone.querySelector('.recent-actions ul')?.replaceChildren();
  clone.querySelectorAll(`[${RA_IDX}]`).forEach((el) => el.removeAttribute(RA_IDX));

  clone.style.display = 'none';
  origBox.after(clone);
  return clone;
}

/** Move every row back to the original list (in order) and remove the twin box. */
function restore(origUl: HTMLElement, filteredBox: HTMLElement | null): void {
  if (!filteredBox) return;
  const filtUl = filteredBox.querySelector<HTMLElement>('.recent-actions ul');
  if (filtUl) {
    const rows = orderedRows(origUl, filtUl);
    const frag = document.createDocumentFragment();
    for (const li of rows) {
      clearTooltip(li);
      li.removeAttribute(RA_IDX);
      frag.appendChild(li);
    }
    origUl.appendChild(frag);
  }
  filteredBox.remove();
}

function setTooltip(li: HTMLElement, text: string): void {
  if (li.title !== text) li.title = text;
}

function clearTooltip(li: HTMLElement): void {
  if (li.hasAttribute('title')) li.removeAttribute('title');
}
