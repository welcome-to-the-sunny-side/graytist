// Shared settings UI — composed by BOTH the popup and the options page, so there's a
// single source of truth. Reads/writes chrome.storage.sync via lib/config and keeps the
// two surfaces in sync if both are open (without clobbering an in-progress edit).

import './settings.css';
import { h } from './dom';
import {
  loadConfig,
  saveConfig,
  watchConfig,
  type GraytistConfig,
  type KeywordMode,
  type KeywordSettings,
} from '@/lib/config';
import { RANKS, type RankId } from '@/lib/ranks';

// Admin/Headquarters is non-rating and never offered as a filter target.
const FILTERABLE_RANKS = RANKS.filter((r) => r.id !== 'admin');

interface Ctx {
  config: GraytistConfig;
  status: HTMLElement;
  save: () => void;
}

export async function mountSettings(root: HTMLElement): Promise<void> {
  const status = h('span', { class: 'gt-status' }, 'Saved');
  let timer: number | undefined;

  const ctx: Ctx = {
    config: await loadConfig(),
    status,
    save: () => {
      if (timer !== undefined) clearTimeout(timer);
      status.textContent = 'Saving…';
      timer = setTimeout(async () => {
        await saveConfig(ctx.config);
        status.textContent = 'Saved';
      }, 250) as unknown as number;
    },
  };

  const render = () => root.replaceChildren(buildUI(ctx));
  render();

  watchConfig((next) => {
    if (JSON.stringify(next) === JSON.stringify(ctx.config)) return; // our own write
    ctx.config = next;
    // Don't yank the DOM out from under an active edit (e.g. a textarea).
    const a = document.activeElement;
    const editing = !!a && root.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT');
    if (!editing) render();
  });
}

function buildUI(ctx: Ctx): HTMLElement {
  const c = ctx.config;
  return h(
    'div',
    { class: 'gt-root' },
    h(
      'header',
      { class: 'gt-header' },
      h('h1', { class: 'gt-title' }, h('img', { class: 'gt-logo', src: '/wordmark.png', alt: 'GRAYtist' })),
      ctx.status,
      switchToggle(c.enabled, 'Extension enabled', (v) => {
        ctx.config.enabled = v;
        ctx.save();
      }),
    ),
    featureSection(
      ctx,
      'Recent Actions',
      'Move filtered blogs into a separate box, by author rank or title keyword.',
      () => ctx.config.recentActions.enabled,
      (v) => (ctx.config.recentActions.enabled = v),
      () => ctx.config.recentActions.filteredRanks,
      keywordEditor(ctx, () => ctx.config.recentActions.keywords),
      necropostToggle(ctx),
    ),
    featureSection(
      ctx,
      'Comments',
      'Collapse comments from filtered ranks when a blog loads.',
      () => ctx.config.comments.enabled,
      (v) => (ctx.config.comments.enabled = v),
      () => ctx.config.comments.filteredRanks,
      unfilteredCountToggle(ctx),
    ),
    featureSection(
      ctx,
      'Standings',
      'Move filtered contestants into a separate leaderboard.',
      () => ctx.config.standings.enabled,
      (v) => (ctx.config.standings.enabled = v),
      () => ctx.config.standings.filteredRanks,
    ),
    whitelistSection(ctx),
  );
}

function featureSection(
  ctx: Ctx,
  title: string,
  desc: string,
  getEnabled: () => boolean,
  setEnabled: (v: boolean) => void,
  getRanks: () => RankId[],
  ...extras: HTMLElement[]
): HTMLElement {
  return h(
    'section',
    { class: 'gt-section' },
    h(
      'div',
      { class: 'gt-section-head' },
      h('h2', {}, title),
      switchToggle(getEnabled(), `${title} enabled`, (v) => {
        setEnabled(v);
        ctx.save();
      }),
    ),
    h('p', { class: 'gt-desc' }, desc),
    rankCells(getRanks, ctx.save),
    ...extras,
  );
}

/**
 * One-line row of color-coded rank cells (unrated → LGM). Bright = NOT filtered;
 * clicking dulls the cell and crosses it out (= filtered). Click again to toggle.
 */
function rankCells(getRanks: () => RankId[], onChange: () => void): HTMLElement {
  const row = h('div', { class: 'gt-cells' });
  for (const r of FILTERABLE_RANKS) {
    const cell = h('button', { type: 'button', class: 'gt-cell', title: r.label, ariaLabel: r.label });
    cell.style.setProperty('--rank', r.cssColor);
    const sync = () => cell.setAttribute('aria-pressed', String(getRanks().includes(r.id)));
    sync();
    cell.addEventListener('click', () => {
      const arr = getRanks();
      const i = arr.indexOf(r.id);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(r.id);
      sync();
      onChange();
    });
    row.append(cell);
  }
  return row;
}

/** A labelled checkbox row (the `gt-check` style). */
function checkToggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const cb = h('input', { type: 'checkbox', checked });
  cb.addEventListener('change', () => onChange(cb.checked));
  return h('label', { class: 'gt-check' }, cb, label);
}

/** Checkbox: show the green "(+N)" count of unfiltered replies hidden under a collapsed comment. */
function unfilteredCountToggle(ctx: Ctx): HTMLElement {
  return checkToggle(
    'Show count of hidden unfiltered replies',
    ctx.config.comments.showUnfilteredCount,
    (v) => {
      ctx.config.comments.showUnfilteredCount = v;
      ctx.save();
    },
  );
}

/** Checkbox: move necropost rows (old entries bumped by a new comment) to the filtered box. */
function necropostToggle(ctx: Ctx): HTMLElement {
  return checkToggle(
    'Filter necroposts (old entries bumped by a new comment)',
    ctx.config.recentActions.filterNecroposts,
    (v) => {
      ctx.config.recentActions.filterNecroposts = v;
      ctx.save();
    },
  );
}

function keywordEditor(ctx: Ctx, get: () => KeywordSettings): HTMLElement {
  const kw = get();
  const area = h('textarea', {
    class: 'gt-textarea',
    rows: 3,
    placeholder: 'One keyword per line',
    value: kw.terms.join('\n'),
  });
  area.addEventListener('input', () => {
    get().terms = area.value.split('\n').map((s) => s.trim()).filter(Boolean);
    ctx.save();
  });

  const mode = h('select', { class: 'gt-select' });
  for (const [value, text] of [
    ['substring', 'contains'],
    ['word', 'whole word'],
    ['regex', 'regex'],
  ] as [KeywordMode, string][]) {
    mode.append(h('option', { value, selected: kw.mode === value }, text));
  }
  mode.addEventListener('change', () => {
    get().mode = mode.value as KeywordMode;
    ctx.save();
  });

  const cs = h('input', { type: 'checkbox', checked: kw.caseSensitive });
  cs.addEventListener('change', () => {
    get().caseSensitive = cs.checked;
    ctx.save();
  });

  return h(
    'div',
    { class: 'gt-sub' },
    h('div', { class: 'gt-field-label' }, 'Title keywords to be filtered'),
    area,
    h(
      'div',
      { class: 'gt-kw-opts' },
      h('span', {}, 'Match:'),
      mode,
      h('label', { class: 'gt-inline' }, cs, 'case-sensitive'),
    ),
  );
}

function whitelistSection(ctx: Ctx): HTMLElement {
  const area = h('textarea', {
    class: 'gt-textarea',
    rows: 3,
    placeholder: 'One handle per line',
    value: ctx.config.whitelist.join('\n'),
  });
  area.addEventListener('input', () => {
    ctx.config.whitelist = area.value.split('\n').map((s) => s.trim()).filter(Boolean);
    ctx.save();
  });
  return h(
    'section',
    { class: 'gt-section' },
    h('div', { class: 'gt-section-head' }, h('h2', {}, 'Whitelist')),
    h(
      'p',
      { class: 'gt-desc' },
      'Accounts never filtered by any feature (overrides everything else). Case-insensitive.',
    ),
    area,
  );
}

function switchToggle(checked: boolean, ariaLabel: string, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    class: 'gt-switch-input',
    checked,
    ariaLabel,
  });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'gt-switch' }, input, h('span', { class: 'gt-slider' }));
}
