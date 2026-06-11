// Pure, DOM-free filtering predicates. Easy to unit-test; feature modules compose
// these with the page-specific scraping.

import type { RankId } from './ranks';
import type { KeywordSettings } from './config';

/** A null/unknown rank is never filtered (we don't act on what we can't classify). */
export function isRankFiltered(rank: RankId | null, filteredRanks: RankId[]): boolean {
  if (rank === null) return false;
  return filteredRanks.includes(rank);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return the first configured keyword that matches `text` (under the chosen mode),
 * or null if none do. Useful when callers want to show which term matched.
 */
export function matchedKeyword(text: string, kw: KeywordSettings): string | null {
  if (kw.terms.length === 0) return null;
  const flags = kw.caseSensitive ? '' : 'i';

  for (const raw of kw.terms) {
    const term = raw.trim();
    if (!term) continue;

    if (kw.mode === 'regex') {
      try {
        if (new RegExp(term, flags).test(text)) return term;
      } catch {
        // Invalid regex — skip this term rather than throwing.
      }
    } else if (kw.mode === 'word') {
      if (new RegExp(`\\b${escapeRegExp(term)}\\b`, flags).test(text)) return term;
    } else {
      // substring
      const hay = kw.caseSensitive ? text : text.toLowerCase();
      const needle = kw.caseSensitive ? term : term.toLowerCase();
      if (hay.includes(needle)) return term;
    }
  }
  return null;
}

/** True if any configured keyword matches `text`. */
export function matchesKeywords(text: string, kw: KeywordSettings): boolean {
  return matchedKeyword(text, kw) !== null;
}
