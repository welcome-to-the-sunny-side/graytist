// Settings schema + storage plumbing.
//
// Stored in chrome.storage.sync (small payload, syncs across the user's devices)
// under a single key. Reads always merge over DEFAULT_CONFIG so older stored blobs
// pick up defaults for newly-added fields.

import { browser } from '#imports';
import { RANK_BY_ID, type RankId } from './ranks';

export type KeywordMode = 'substring' | 'word' | 'regex';

export interface KeywordSettings {
  terms: string[];
  mode: KeywordMode;
  caseSensitive: boolean;
}

export interface RecentActionsSettings {
  enabled: boolean;
  /** Ranks whose blogs get moved to the "Filtered Recent Actions" box. */
  filteredRanks: RankId[];
  /** Title keywords that move a blog to the filtered box. */
  keywords: KeywordSettings;
  /** Move "necropost" rows (old entries bumped back up by a new comment) to the filtered box. */
  filterNecroposts: boolean;
}

export interface CommentsSettings {
  enabled: boolean;
  /** Ranks whose comments get collapsed on load. */
  filteredRanks: RankId[];
  /** Show the green "(+N)" count of unfiltered replies hidden under a collapsed comment. */
  showUnfilteredCount: boolean;
}

export interface StandingsSettings {
  enabled: boolean;
  /** Ranks moved to the "Filtered standings" table. */
  filteredRanks: RankId[];
}

export interface GraytistConfig {
  /** Master switch — when false the extension is inert. */
  enabled: boolean;
  /**
   * Global allowlist of handles (case-insensitive) that are NEVER filtered by any
   * feature — overrides ranks and keywords. For official unrated accounts etc.
   */
  whitelist: string[];
  recentActions: RecentActionsSettings;
  comments: CommentsSettings;
  standings: StandingsSettings;
}

export const DEFAULT_CONFIG: GraytistConfig = {
  enabled: true,
  whitelist: ['atcoder_official', 'ICPCNews', 'luogu_official', 'MikeMirzayanov'],
  recentActions: {
    enabled: true,
    filteredRanks: [],
    keywords: { terms: [], mode: 'substring', caseSensitive: false },
    filterNecroposts: false,
  },
  comments: {
    enabled: true,
    filteredRanks: [],
    showUnfilteredCount: true,
  },
  standings: {
    enabled: true,
    filteredRanks: [],
  },
};

const STORAGE_KEY = 'graytist:config';

export async function loadConfig(): Promise<GraytistConfig> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  return mergeConfig(DEFAULT_CONFIG, stored[STORAGE_KEY]);
}

export async function saveConfig(config: GraytistConfig): Promise<void> {
  await browser.storage.sync.set({ [STORAGE_KEY]: config });
}

/** Subscribe to live config changes (e.g. edits made in the options page). */
export function watchConfig(cb: (config: GraytistConfig) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    area: string,
  ) => {
    if (area === 'sync' && STORAGE_KEY in changes) {
      cb(mergeConfig(DEFAULT_CONFIG, changes[STORAGE_KEY]!.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// ---- merge / validation -------------------------------------------------------

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

function asRankArray(v: unknown): RankId[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is RankId => typeof x === 'string' && x in RANK_BY_ID);
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function mergeKeywords(base: KeywordSettings, o: unknown): KeywordSettings {
  const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const mode: KeywordMode =
    src.mode === 'substring' || src.mode === 'word' || src.mode === 'regex' ? src.mode : base.mode;
  return {
    terms: asStringArray(src.terms) ?? [...base.terms],
    mode,
    caseSensitive: asBool(src.caseSensitive, base.caseSensitive),
  };
}

export function mergeConfig(base: GraytistConfig, o: unknown): GraytistConfig {
  const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const ra = (src.recentActions ?? {}) as Record<string, unknown>;
  const cm = (src.comments ?? {}) as Record<string, unknown>;
  const st = (src.standings ?? {}) as Record<string, unknown>;
  return {
    enabled: asBool(src.enabled, base.enabled),
    whitelist: asStringArray(src.whitelist) ?? [...base.whitelist],
    recentActions: {
      enabled: asBool(ra.enabled, base.recentActions.enabled),
      filteredRanks: asRankArray(ra.filteredRanks) ?? [...base.recentActions.filteredRanks],
      keywords: mergeKeywords(base.recentActions.keywords, ra.keywords),
      filterNecroposts: asBool(ra.filterNecroposts, base.recentActions.filterNecroposts),
    },
    comments: {
      enabled: asBool(cm.enabled, base.comments.enabled),
      filteredRanks: asRankArray(cm.filteredRanks) ?? [...base.comments.filteredRanks],
      showUnfilteredCount: asBool(cm.showUnfilteredCount, base.comments.showUnfilteredCount),
    },
    standings: {
      enabled: asBool(st.enabled, base.standings.enabled),
      filteredRanks: asRankArray(st.filteredRanks) ?? [...base.standings.filteredRanks],
    },
  };
}
