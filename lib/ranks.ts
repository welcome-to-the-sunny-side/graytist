// Codeforces rank model.
//
// Every handle is rendered as `<a class="rated-user user-COLOR" title="<Rank> <handle>">`.
// The color class is bucket-granular (orange = Master OR Int'l Master; red = GM OR
// Int'l GM), but the `title` attribute spells out the EXACT named rank. So we resolve
// title-first and fall back to the color class — no API needed.
//
// Notable real-markup facts (confirmed against saved pages):
//   - Legendary GM has its own class `user-legendary` (NOT `user-red`), plus a
//     `<span class="legendary-user-first-letter">` around the first letter.
//   - `user-admin` exists (e.g. MikeMirzayanov, title "Headquarters, <handle>") and is
//     a non-rating class — we never auto-filter it.

export type RankId =
  | 'unrated'
  | 'newbie'
  | 'pupil'
  | 'specialist'
  | 'expert'
  | 'candidate-master'
  | 'master'
  | 'international-master'
  | 'grandmaster'
  | 'international-grandmaster'
  | 'legendary-grandmaster'
  | 'admin';

export interface RankInfo {
  id: RankId;
  /** Human label shown in the options UI. */
  label: string;
  /** Inclusive rating bounds; null where there is no numeric rating. */
  min: number | null;
  max: number | null;
  /** The `user-*` class for this rank (used for the color fallback + UI swatch). */
  colorClass: string;
  /** CSS color approximating how Codeforces renders the handle (for UI swatches). */
  cssColor: string;
}

/** Ordered low → high. `admin` is special (non-rating) and excluded from filter UIs. */
export const RANKS: RankInfo[] = [
  { id: 'unrated', label: 'Unrated', min: null, max: null, colorClass: 'user-black', cssColor: '#000000' },
  { id: 'newbie', label: 'Newbie', min: 0, max: 1199, colorClass: 'user-gray', cssColor: '#808080' },
  { id: 'pupil', label: 'Pupil', min: 1200, max: 1399, colorClass: 'user-green', cssColor: '#008000' },
  { id: 'specialist', label: 'Specialist', min: 1400, max: 1599, colorClass: 'user-cyan', cssColor: '#03a89e' },
  { id: 'expert', label: 'Expert', min: 1600, max: 1899, colorClass: 'user-blue', cssColor: '#0000ff' },
  { id: 'candidate-master', label: 'Candidate Master', min: 1900, max: 2099, colorClass: 'user-violet', cssColor: '#aa00aa' },
  { id: 'master', label: 'Master', min: 2100, max: 2299, colorClass: 'user-orange', cssColor: '#ff8c00' },
  { id: 'international-master', label: 'International Master', min: 2300, max: 2399, colorClass: 'user-orange', cssColor: '#ff8c00' },
  { id: 'grandmaster', label: 'Grandmaster', min: 2400, max: 2599, colorClass: 'user-red', cssColor: '#ff0000' },
  { id: 'international-grandmaster', label: 'International Grandmaster', min: 2600, max: 2999, colorClass: 'user-red', cssColor: '#ff0000' },
  { id: 'legendary-grandmaster', label: 'Legendary Grandmaster', min: 3000, max: null, colorClass: 'user-legendary', cssColor: '#ff0000' },
  { id: 'admin', label: 'Admin / Headquarters', min: null, max: null, colorClass: 'user-admin', cssColor: '#000000' },
];

export const RANK_BY_ID: Record<RankId, RankInfo> = Object.fromEntries(
  RANKS.map((r) => [r.id, r]),
) as Record<RankId, RankInfo>;

/** Exact named rank (from the `title` attribute), normalized to lowercase. */
const TITLE_TO_RANK: Record<string, RankId> = {
  'unrated': 'unrated',
  'newbie': 'newbie',
  'pupil': 'pupil',
  'specialist': 'specialist',
  'expert': 'expert',
  'candidate master': 'candidate-master',
  'master': 'master',
  'international master': 'international-master',
  'grandmaster': 'grandmaster',
  'international grandmaster': 'international-grandmaster',
  'legendary grandmaster': 'legendary-grandmaster',
  'headquarters': 'admin',
};

/**
 * Color class → rank. Ambiguous colors map to their LOWER tier; the title attribute
 * (resolved first) is what distinguishes Master/Int'l Master and GM/Int'l GM. This
 * only matters in the rare case a `title` is missing or unrecognized.
 */
const CLASS_TO_RANK: Record<string, RankId> = {
  'user-black': 'unrated',
  'user-gray': 'newbie',
  'user-green': 'pupil',
  'user-cyan': 'specialist',
  'user-blue': 'expert',
  'user-violet': 'candidate-master',
  'user-orange': 'master',
  'user-red': 'grandmaster',
  'user-legendary': 'legendary-grandmaster',
  'user-admin': 'admin',
};

export interface ClassifiedUser {
  handle: string;
  /** null = couldn't determine → callers must NOT filter. */
  rank: RankId | null;
  resolvedBy: 'title' | 'class' | null;
}

/**
 * Classify the user behind an `a.rated-user` anchor. Title-first (exact named rank),
 * color-class fallback. Codeforces handles never contain spaces, so the rank name in
 * the title is simply the title with the trailing handle stripped off.
 */
export function classifyUserLink(a: Element): ClassifiedUser {
  const handle = (a.textContent ?? '').trim();

  const title = (a.getAttribute('title') ?? '').trim();
  if (title) {
    let rankPart = title;
    if (handle && title.endsWith(handle)) {
      rankPart = title.slice(0, title.length - handle.length);
    }
    const key = rankPart.replace(/[\s,]+$/, '').trim().toLowerCase();
    const fromTitle = TITLE_TO_RANK[key];
    if (fromTitle) return { handle, rank: fromTitle, resolvedBy: 'title' };
  }

  for (const cls of a.classList) {
    const fromClass = CLASS_TO_RANK[cls];
    if (fromClass) return { handle, rank: fromClass, resolvedBy: 'class' };
  }

  return { handle, rank: null, resolvedBy: null };
}
