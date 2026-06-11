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
//
// Liveness: live + respectful. A per-comment marker tracks who collapsed it:
//   (unset) → we never touched it          'collapsed' → we collapsed it
//   'override' → you manually expanded ours → we leave it alone thereafter
// All our changes are inline styles / attributes (never childList), so this pass never
// re-triggers the MutationObserver that drives it, and settles to a no-op.

import { classifyUserLink, RANK_BY_ID } from '@/lib/ranks';
import { isWhitelisted, normalizeHandles } from '@/lib/filter';
import type { CommentsSettings, GraytistConfig } from '@/lib/config';

const MARK = 'data-graytist-cmt'; // '' | 'collapsed' | 'override'

export function runComments(config: GraytistConfig): void {
  const container = document.querySelector('.comments[commentableid]');
  if (!container) return;

  const active = config.enabled && config.comments.enabled;
  const whitelist = normalizeHandles(config.whitelist);
  for (const comment of container.querySelectorAll<HTMLElement>('.comment[commentid]')) {
    processComment(comment, config.comments, whitelist, active);
  }
}

function processComment(
  comment: HTMLElement,
  cm: CommentsSettings,
  whitelist: Set<string>,
  active: boolean,
): void {
  const state = comment.getAttribute(MARK);

  if (!active) {
    // Extension/feature off — undo only what we did, then forget the comment.
    if (state === 'collapsed' && isCollapsed(comment)) expand(comment);
    if (state) {
      comment.removeAttribute(MARK);
      clearTooltip(comment);
    }
    return;
  }

  if (state === 'override') return; // you took control — hands off

  const reason = decide(comment, cm, whitelist);

  if (reason) {
    if (state === 'collapsed') {
      // We collapsed it earlier; if it's now expanded, you did that — respect it.
      if (!isCollapsed(comment)) comment.setAttribute(MARK, 'override');
    } else if (!isCollapsed(comment)) {
      // Newly filtered and currently expanded → collapse it. (If it was already
      // collapsed by Codeforces/you, we leave it unmarked and untouched.)
      collapse(comment);
      setTooltip(comment, reason);
      comment.setAttribute(MARK, 'collapsed');
    }
  } else if (state === 'collapsed') {
    // No longer filtered → undo our collapse.
    if (isCollapsed(comment)) expand(comment);
    comment.removeAttribute(MARK);
    clearTooltip(comment);
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
