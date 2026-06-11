# Graytist

Browser extension (Chrome/Chromium, MV3) that filters Codeforces content by **rating
tier** and **keywords**. No Codeforces API is used: a user's rank is read straight from
the DOM, because every handle is rendered with a color class and a title attribute that
encode the rank.

## Stack
- **WXT** (wxt.dev) + **TypeScript**, vanilla (no UI framework).
- `npm run dev` (Chrome), `npm run build`, `npm run compile` (tsc typecheck).
- Entry points live in `entrypoints/`; shared logic in `lib/` (imported via the `@/` alias).

## Features (built one at a time)
1. **Recent Actions** — move filtered blogs into a "Filtered Recent Actions" box, by the
   blog author's rank and/or title keywords.
2. **Comments** — collapse filtered comments on load (Codeforces' native collapse).
3. **Standings** — move filtered contestants into a "Filtered Leaderboard" (e.g. new/unrated
   accounts, a common AI-cheater signal).

A single global **whitelist** of handles (case-insensitive) overrides every feature: content
by a whitelisted author is never filtered. Defaults to official unrated accounts
(`atcoder_official`, `ICPCNews`, `luogu_official`, `MikeMirzayanov`).

## How ranks are read (the core trick)
Handles render as `<a class="rated-user user-COLOR" title="<Rank> <handle>">handle</a>`.
- The **title** spells out the exact named rank, so we resolve title-first.
- The **color class** is the fallback; it's bucket-granular: `user-orange` = Master OR
  Int'l Master, `user-red` = GM OR Int'l GM. Title disambiguates these.
- **Legendary GM** has its own class `user-legendary` (NOT `user-red`) + a
  `<span class="legendary-user-first-letter">` first letter.
- **`user-admin`** (e.g. MikeMirzayanov, title "Headquarters, …") is non-rating and never
  auto-filtered.
- Handles contain no spaces, so the rank name in a title is the title minus the trailing
  handle. See `lib/ranks.ts` (`classifyUserLink`).

## Key DOM selectors (confirmed against saved pages in `tmp/`, gitignored)
- **Recent Actions**: unique `div.recent-actions` (inside a `div.roundbox.sidebox`). Rows are
  `.recent-actions > ul > li`; first `a.rated-user` = blog author, second
  `a[href*="/blog/entry/"]` = title (keyword target). One user per row = the author.
- **Comments**: unique `div.comments[commentableid]`. Each comment is `div.comment[commentid]`
  with two pre-rendered views — `.hidden-comment` (collapsed, `display:none`) and
  `.shown-comment` (expanded); children nest under `.shown-comment > ul.comment-children`.
  Collapse = flip those two `display` values (no dependency on Codeforces' JS). Author is the
  `a.rated-user` in the avatar; scope by matching `commentid` to avoid grabbing a child's.

## Layout
- `lib/ranks.ts` — rank model + `classifyUserLink()`.
- `lib/config.ts` — settings schema, defaults, `chrome.storage.sync` load/save/watch + merge.
- `lib/filter.ts` — pure predicates (`isRankFiltered`, `matchedKeyword`, `isWhitelisted`).
- `lib/dom.ts` — `observeDom()` (debounced load+mutation driver) + idempotency markers.
- `entrypoints/content.ts` — content script; feature passes hook into `apply()`.
- `entrypoints/options/` — settings UI.
