// Feature 3 — standings / leaderboard filtering.
//
// `table.standings` (inside `div.datatable`) has a header `<tr>`, contestant rows
// `tr[participantid]`, and a trailing `tr.standingsStatisticsRow`. We move filtered
// contestant rows into a cloned "Filtered standings" table placed below the page nav
// (`.custom-links-pagination`) that follows the original. Original ranks are preserved:
// we move whole rows, so the rank cell rides along and nothing is renumbered.
//
// Single-contestant rows only — rows with multiple handles (teams) are left alone.
// Header and statistics rows never move. Pagination size is irrelevant (we partition
// whatever rows are on the current page). Idempotent, live, and reversible like feature 1.

import { classifyUserLink, RANK_BY_ID } from '@/lib/ranks';
import { isWhitelisted, normalizeHandles } from '@/lib/filter';
import type { GraytistConfig, StandingsSettings } from '@/lib/config';

const WRAP_ATTR = 'data-graytist-filtered-standings';
const ST_IDX = 'data-graytist-st-idx';

export function runStandings(config: GraytistConfig): void {
  const wrap = document.querySelector<HTMLElement>(`[${WRAP_ATTR}]`);

  // Original table = the .standings not inside our filtered clone.
  const origTable = Array.from(document.querySelectorAll<HTMLElement>('table.standings')).find(
    (t) => !wrap || !wrap.contains(t),
  );
  if (!origTable) {
    wrap?.remove();
    return;
  }
  const origTbody = origTable.querySelector<HTMLElement>(':scope > tbody');
  const origDatatable = origTable.closest<HTMLElement>('.datatable');
  if (!origTbody || !origDatatable) return;

  const st = config.standings;
  if (!config.enabled || !st.enabled) {
    restore(origTbody, wrap);
    return;
  }

  const box = wrap ?? createFilteredTable(origDatatable);
  const filtTbody = box.querySelector<HTMLElement>('table.standings > tbody');
  if (!filtTbody) return;

  const whitelist = normalizeHandles(config.whitelist);
  const keep: HTMLElement[] = [];
  const drop: HTMLElement[] = [];
  for (const row of orderedRows(origTbody, filtTbody)) {
    const reason = decide(row, st, whitelist);
    if (reason) {
      drop.push(row);
      setTooltip(row, reason);
    } else {
      keep.push(row);
      clearTooltip(row);
    }
  }

  // Kept rows go back between the header and the statistics row; dropped rows go after
  // the filtered table's header.
  const stats = statsRow(origTbody);
  applyRows(origTbody, keep, stats);
  applyRows(filtTbody, drop, null);

  const display = drop.length > 0 ? '' : 'none';
  if (box.style.display !== display) box.style.display = display;
}

/** Filter reason, or null. Only single-contestant rows are considered. */
function decide(row: HTMLElement, st: StandingsSettings, whitelist: Set<string>): string | null {
  const links = row.querySelectorAll('td.contestant-cell a.rated-user');
  if (links.length !== 1) return null; // teams / empty rows: leave alone
  const { handle, rank } = classifyUserLink(links[0]!);
  if (isWhitelisted(handle, whitelist)) return null;
  if (rank !== null && st.filteredRanks.includes(rank)) {
    return `Filtered (${RANK_BY_ID[rank].label})`;
  }
  return null;
}

function contestantRows(tbody: HTMLElement): HTMLElement[] {
  return Array.from(tbody.children).filter(
    (c): c is HTMLElement => c.tagName === 'TR' && c.hasAttribute('participantid'),
  );
}

function statsRow(tbody: HTMLElement): HTMLElement | null {
  return tbody.querySelector<HTMLElement>(':scope > tr.standingsStatisticsRow');
}

/** Contestant rows from both tables, in original order (stable index, assigned once). */
function orderedRows(origTbody: HTMLElement, filtTbody: HTMLElement): HTMLElement[] {
  const rows = [...contestantRows(origTbody), ...contestantRows(filtTbody)];
  let maxIdx = -1;
  for (const r of rows) {
    const v = r.getAttribute(ST_IDX);
    if (v !== null) maxIdx = Math.max(maxIdx, Number(v));
  }
  for (const r of rows) {
    if (r.getAttribute(ST_IDX) === null) r.setAttribute(ST_IDX, String(++maxIdx));
  }
  rows.sort((a, b) => Number(a.getAttribute(ST_IDX)) - Number(b.getAttribute(ST_IDX)));
  return rows;
}

function sameRows(tbody: HTMLElement, rows: HTMLElement[]): boolean {
  const cur = contestantRows(tbody);
  if (cur.length !== rows.length) return false;
  for (let i = 0; i < rows.length; i++) {
    if (cur[i] !== rows[i]) return false;
  }
  return true;
}

/** Place `rows` (in order) just before `anchor`, only if they aren't already so. */
function applyRows(tbody: HTMLElement, rows: HTMLElement[], anchor: Node | null): void {
  if (sameRows(tbody, rows)) return;
  const frag = document.createDocumentFragment();
  for (const r of rows) frag.appendChild(r);
  tbody.insertBefore(frag, anchor);
}

/** Clone the datatable for identical chrome; keep only the header row; add a heading. */
function createFilteredTable(origDatatable: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute(WRAP_ATTR, '');
  wrap.style.display = 'none';

  const heading = document.createElement('div');
  heading.textContent = 'Filtered standings';
  heading.setAttribute('style', 'font-size:1.4em;font-weight:bold;margin:1em 0 0.3em;');

  const clone = origDatatable.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll(`[${ST_IDX}]`).forEach((el) => el.removeAttribute(ST_IDX));

  // Drop the cloned contestant + statistics rows; keep the header row.
  const tbody = clone.querySelector('table.standings > tbody');
  if (tbody) {
    for (const tr of Array.from(tbody.children)) {
      if (tr.tagName === 'TR' && (tr.hasAttribute('participantid') || tr.classList.contains('standingsStatisticsRow'))) {
        tr.remove();
      }
    }
  }

  wrap.append(heading, clone);

  const nav = followingPagination(origDatatable);
  (nav ?? origDatatable).after(wrap);
  return wrap;
}

/** The page nav that comes after the original table (so a nav above it isn't picked). */
function followingPagination(origDatatable: HTMLElement): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('.custom-links-pagination')).find(
      (n) => origDatatable.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ?? null
  );
}

/** Move every contestant row back into the original table (before stats) and drop the clone. */
function restore(origTbody: HTMLElement, wrap: HTMLElement | null): void {
  if (!wrap) return;
  const filtTbody = wrap.querySelector<HTMLElement>('table.standings > tbody');
  if (filtTbody) {
    const rows = orderedRows(origTbody, filtTbody);
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      clearTooltip(r);
      r.removeAttribute(ST_IDX);
      frag.appendChild(r);
    }
    origTbody.insertBefore(frag, statsRow(origTbody));
  }
  wrap.remove();
}

function setTooltip(row: HTMLElement, text: string): void {
  if (row.title !== text) row.title = text;
}

function clearTooltip(row: HTMLElement): void {
  if (row.hasAttribute('title')) row.removeAttribute('title');
}
