// Feature 2 — collapse filtered comments.
//
// Comments live in a unique `div.comments[commentableid]`. Every comment (nested or not)
// is `div.comment[commentid]` with two pre-rendered views: `.hidden-comment` (the collapsed
// stub, initially `display:none`) and `.shown-comment` (expanded; replies nest under
// `.shown-comment > ul.comment-children`). Collapsing = flip those two displays, which is
// exactly Codeforces' native collapsed state, so the stub's "show (+N)" link still expands it.
//
// We filter by the comment's OWN author rank (scoped to its own avatar, never a reply's).
// Collapsing a comment folds its whole subtree — that's the chosen behavior for mixed threads.
// Since that can bury an unfiltered reply, a collapsed stub gets a green "(+N)" tag next to
// Codeforces' own "show (+N)" link, counting the would-be-visible replies hidden inside — so a
// good reply under a filtered comment isn't silently lost (toggleable via showUnfilteredCount).
// That count needs every comment's verdict up front, so runComments works in two phases:
// decide all, then apply.
//
// The tag (and the hover tooltip) are shown for ANY filtered comment that's currently
// collapsed — including ones Codeforces itself renders collapsed. CF persists manual hides
// server-side, so a comment you once hid comes back already-collapsed on the next load. The
// annotations are our own DOM, so we add/remove them freely without claiming the collapse:
// the ownership mark (below) governs only the collapses WE make and later undo.
//
// Respectful re-runs: a per-comment ownership mark tracks who collapsed it:
//   (unset) → we never touched it          'collapsed' → we collapsed it
//   'override' → you manually expanded ours → we leave it alone thereafter
// On each config change we re-process every comment; the mark is what lets a re-run tell our
// own collapses from yours, so it settles to a no-op and never fights you.

import { classifyUserLink, RANK_BY_ID } from '@/lib/ranks';
import { isWhitelisted, normalizeHandles } from '@/lib/filter';
import type { CommentsSettings, GraytistConfig } from '@/lib/config';

const MARK = 'data-graytist-cmt'; // collapse ownership: '' | 'collapsed' | 'override'
const ANNOT = 'data-graytist-cmt-annot'; // set while this comment carries our tooltip/marker

export function runComments(config: GraytistConfig): void {
  const container = document.querySelector('.comments[commentableid]');
  if (!container) return;

  const active = config.enabled && config.comments.enabled;
  const whitelist = normalizeHandles(config.whitelist);
  const comments = Array.from(container.querySelectorAll<HTMLElement>('.comment[commentid]'));

  // Phase 1: each comment's verdict (null = not filtered = would-be-visible).
  const verdict = new Map<HTMLElement, string | null>();
  let anyFiltered = false;
  if (active) {
    for (const c of comments) {
      const reason = decide(c, config.comments, whitelist);
      verdict.set(c, reason);
      anyFiltered ||= reason !== null;
    }
  }

  // How many unfiltered replies each collapse would bury — one O(N) bottom-up pass, and only
  // when something is filtered AND the user wants the count (no count ⇒ no marker shows).
  const counts =
    anyFiltered && config.comments.showUnfilteredCount
      ? unfilteredDescendantCounts(comments, verdict)
      : new Map<HTMLElement, number>();

  // Phase 2: collapse / restore, and annotate collapsed filtered comments.
  for (const c of comments) processComment(c, verdict, counts, active);
}

/**
 * For every comment, how many comments in its subtree are NOT filtered — the would-be-visible
 * replies a collapse buries. One bottom-up pass: each unfiltered comment adds 1 to each of its
 * ancestor comments (via a precomputed parent map), so it's O(comments × nesting depth) with no
 * per-comment subtree scans.
 */
function unfilteredDescendantCounts(
  comments: HTMLElement[],
  verdict: Map<HTMLElement, string | null>,
): Map<HTMLElement, number> {
  const parent = new Map<HTMLElement, HTMLElement | null>();
  for (const c of comments) {
    parent.set(c, c.parentElement?.closest<HTMLElement>('.comment[commentid]') ?? null);
  }
  const counts = new Map<HTMLElement, number>();
  for (const c of comments) {
    if (verdict.get(c) !== null) continue; // filtered comments aren't "buried replies"
    for (let a = parent.get(c) ?? null; a; a = parent.get(a) ?? null) {
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
  }
  return counts;
}

function processComment(
  comment: HTMLElement,
  verdict: Map<HTMLElement, string | null>,
  counts: Map<HTMLElement, number>,
  active: boolean,
): void {
  const state = comment.getAttribute(MARK);

  if (!active) {
    // Extension/feature off — undo only the collapses WE own, then drop all annotations.
    if (state === 'collapsed' && isCollapsed(comment)) expand(comment);
    if (state) comment.removeAttribute(MARK);
    if (comment.hasAttribute(ANNOT)) clearAnnotations(comment);
    return;
  }

  // You manually expanded a comment we collapsed → hands off the collapse for good. It's
  // expanded now, so just keep its stub clean.
  if (state === 'override') {
    if (comment.hasAttribute(ANNOT)) clearAnnotations(comment);
    return;
  }

  const reason = verdict.get(comment) ?? null;

  // --- collapse ownership: we only ever collapse/expand on our OWN behalf -------------
  if (reason) {
    if (state === 'collapsed' && !isCollapsed(comment)) {
      // We collapsed it earlier; you expanded it → respect that from now on.
      comment.setAttribute(MARK, 'override');
    } else if (state !== 'collapsed' && !isCollapsed(comment)) {
      // Filtered + expanded + not ours yet → collapse it and claim it.
      collapse(comment);
      comment.setAttribute(MARK, 'collapsed');
    }
    // else: filtered + already collapsed (by us, or by Codeforces/you) → leave it as-is.
  } else if (state === 'collapsed') {
    // No longer filtered → undo OUR collapse (never one Codeforces/you made).
    if (isCollapsed(comment)) expand(comment);
    comment.removeAttribute(MARK);
  }

  // --- annotations: independent of WHO collapsed it ----------------------------------
  // A filtered comment that's collapsed for any reason still buries its replies, so it gets
  // the tooltip + green "(+N)" marker whenever it's currently collapsed. The ANNOT flag lets
  // the common (un-annotated) comment skip the teardown queries entirely.
  if (reason && isCollapsed(comment)) {
    setTooltip(comment, reason);
    updateMarker(comment, counts.get(comment) ?? 0);
    comment.setAttribute(ANNOT, '');
  } else if (comment.hasAttribute(ANNOT)) {
    clearAnnotations(comment);
  }
}

/** Filter reason (author rank) for this comment, or null. Whitelist overrides all. */
function decide(comment: HTMLElement, cm: CommentsSettings, whitelist: Set<string>): string | null {
  const link = ownAuthorLink(comment);
  if (!link) return null;
  const { handle, rank } = classifyUserLink(link);
  if (isWhitelisted(handle, whitelist)) return null;
  if (rank !== null && cm.filteredRanks.includes(rank)) {
    return `Filtered (${RANK_BY_ID[rank].label})`;
  }
  return null;
}

/** This comment's own author anchor (the stub avatar comes first; never a reply's). */
function ownAuthorLink(comment: HTMLElement): Element | null {
  return (
    comment.querySelector(':scope > .hidden-comment a.rated-user') ??
    comment.querySelector(':scope > .shown-comment > .comment-table a.rated-user')
  );
}

function shownView(comment: HTMLElement): HTMLElement | null {
  return comment.querySelector(':scope > .shown-comment');
}
function hiddenView(comment: HTMLElement): HTMLElement | null {
  return comment.querySelector(':scope > .hidden-comment');
}

/** Collapsed iff the expanded view is hidden. Catches our own collapses and CF's. */
function isCollapsed(comment: HTMLElement): boolean {
  const shown = shownView(comment);
  return !!shown && shown.style.display === 'none';
}

function collapse(comment: HTMLElement): void {
  const shown = shownView(comment);
  const hidden = hiddenView(comment);
  if (shown) shown.style.display = 'none';
  if (hidden) hidden.style.display = 'block';
}

function expand(comment: HTMLElement): void {
  const shown = shownView(comment);
  const hidden = hiddenView(comment);
  if (hidden) hidden.style.display = 'none'; // back to its original inline state
  if (shown) shown.style.display = ''; // revert to Codeforces' natural display
}

function setTooltip(comment: HTMLElement, text: string): void {
  const hidden = hiddenView(comment);
  if (hidden && hidden.title !== text) hidden.title = text;
}

function clearTooltip(comment: HTMLElement): void {
  const hidden = hiddenView(comment);
  if (hidden?.hasAttribute('title')) hidden.removeAttribute('title');
}

// ---- subtree marker: count of unfiltered replies a collapse hides --------------
//
// Our own <span>, placed after Codeforces' "show (+N)" link inside the collapsed stub. We
// never touch CF's link, so add/remove is trivial. Styled inline (this runs on CF's page,
// not our popup, so settings.css doesn't apply here).

const MARKER_ATTR = 'data-graytist-cmt-marker';
const MARKER_COLOR = '#4c9a2a'; // matches the popup's "on" green

/** Add/update the green "(+N)" tag on this stub (removing it when the count is zero). */
function updateMarker(comment: HTMLElement, n: number): void {
  if (n <= 0) {
    clearMarker(comment);
    return;
  }

  const link = comment.querySelector<HTMLElement>(':scope > .hidden-comment a.showComment');
  if (!link) return;

  let marker = comment.querySelector<HTMLElement>(`:scope > .hidden-comment [${MARKER_ATTR}]`);
  if (!marker) {
    marker = document.createElement('span');
    marker.setAttribute(MARKER_ATTR, '');
    marker.style.marginLeft = '4px';
    marker.style.color = MARKER_COLOR;
    marker.style.fontWeight = '600';
    marker.style.whiteSpace = 'nowrap';
    link.after(marker);
  }
  marker.textContent = `(+${n})`;
  marker.title = `${n} unfiltered ${n === 1 ? 'reply' : 'replies'} in the subtree of this comment`;
}

function clearMarker(comment: HTMLElement): void {
  comment.querySelector(`:scope > .hidden-comment [${MARKER_ATTR}]`)?.remove();
}

/** Drop both annotations (tooltip + marker) and the flag that tracks them. */
function clearAnnotations(comment: HTMLElement): void {
  clearTooltip(comment);
  clearMarker(comment);
  comment.removeAttribute(ANNOT);
}
