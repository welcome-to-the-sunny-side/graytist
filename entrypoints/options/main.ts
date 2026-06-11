import {
  loadConfig,
  saveConfig,
  type GraytistConfig,
  type KeywordMode,
  type KeywordSettings,
} from '@/lib/config';
import { RANKS, type RankId } from '@/lib/ranks';

// Admin/Headquarters is non-rating and never offered as a filter target.
const FILTERABLE_RANKS = RANKS.filter((r) => r.id !== 'admin');

let config: GraytistConfig;
let saveTimer: number | undefined;
let statusEl: HTMLElement;

// --- tiny DOM helper -----------------------------------------------------------
type Props = Record<string, unknown> & { class?: string };
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else (node as Record<string, unknown>)[k] = v;
  }
  node.append(...children);
  return node;
}

function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  statusEl.textContent = 'Saving…';
  saveTimer = setTimeout(async () => {
    await saveConfig(config);
    statusEl.textContent = 'Saved ✓';
  }, 300) as unknown as number;
}

// --- reusable controls ---------------------------------------------------------
function toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const cb = h('input', { type: 'checkbox', checked });
  cb.addEventListener('change', () => onChange(cb.checked));
  return h('label', { class: 'toggle' }, cb, document.createTextNode(label));
}

function rankGrid(selected: RankId[], onToggle: (id: RankId, on: boolean) => void): HTMLElement {
  const grid = h('div', { class: 'ranks' });
  for (const r of FILTERABLE_RANKS) {
    const cb = h('input', { type: 'checkbox', checked: selected.includes(r.id) });
    cb.addEventListener('change', () => onToggle(r.id, cb.checked));
    const swatch = h('span', { class: 'swatch' });
    swatch.style.background = r.cssColor;
    grid.append(h('label', { class: 'rank' }, cb, swatch, document.createTextNode(r.label)));
  }
  return grid;
}

function keywordEditor(kw: KeywordSettings): HTMLElement {
  const area = h('textarea', {
    rows: 4,
    placeholder: 'One keyword per line',
    value: kw.terms.join('\n'),
  });
  area.addEventListener('input', () => {
    kw.terms = area.value.split('\n').map((s) => s.trim()).filter(Boolean);
    scheduleSave();
  });

  const modeSel = h('select');
  for (const [value, text] of [
    ['substring', 'contains'],
    ['word', 'whole word'],
    ['regex', 'regex'],
  ] as [KeywordMode, string][]) {
    modeSel.append(h('option', { value, selected: kw.mode === value }, text));
  }
  modeSel.addEventListener('change', () => {
    kw.mode = modeSel.value as KeywordMode;
    scheduleSave();
  });

  const caseToggle = toggle('case-sensitive', kw.caseSensitive, (v) => {
    kw.caseSensitive = v;
    scheduleSave();
  });

  return h(
    'div',
    { class: 'keywords' },
    h('div', { class: 'field-label' }, 'Title keywords'),
    area,
    h('div', { class: 'keyword-opts' }, h('span', {}, 'Match:'), modeSel, caseToggle),
  );
}

function rankSet(get: () => RankId[], set: (next: RankId[]) => void): HTMLElement {
  return rankGrid(get(), (id, on) => {
    const next = new Set(get());
    if (on) next.add(id);
    else next.delete(id);
    set([...next]);
    scheduleSave();
  });
}

// --- sections ------------------------------------------------------------------
function section(
  title: string,
  desc: string,
  enabled: boolean,
  onEnabled: (v: boolean) => void,
  body: HTMLElement[],
): HTMLElement {
  return h(
    'section',
    { class: 'feature' },
    h('div', { class: 'feature-head' }, h('h2', {}, title), toggle('enabled', enabled, onEnabled)),
    h('p', { class: 'desc' }, desc),
    ...body,
  );
}

function render(): void {
  const app = document.getElementById('app')!;
  app.replaceChildren();

  statusEl = h('span', { class: 'status' }, 'Saved ✓');

  app.append(
    h(
      'header',
      {},
      h('h1', {}, 'Graytist'),
      statusEl,
      toggle('Extension enabled', config.enabled, (v) => {
        config.enabled = v;
        scheduleSave();
      }),
    ),
  );

  app.append(
    section(
      'Recent Actions',
      "Move filtered blogs into a separate 'Filtered Recent Actions' box, by the blog author's rank and/or title keywords.",
      config.recentActions.enabled,
      (v) => {
        config.recentActions.enabled = v;
        scheduleSave();
      },
      [
        h('div', { class: 'field-label' }, 'Filter blogs by these author ranks'),
        rankSet(
          () => config.recentActions.filteredRanks,
          (next) => (config.recentActions.filteredRanks = next),
        ),
        keywordEditor(config.recentActions.keywords),
      ],
    ),
  );

  app.append(
    section(
      'Comments',
      'Collapse comments from filtered ranks when a blog page loads.',
      config.comments.enabled,
      (v) => {
        config.comments.enabled = v;
        scheduleSave();
      },
      [
        h('div', { class: 'field-label' }, 'Collapse comments from these ranks'),
        rankSet(
          () => config.comments.filteredRanks,
          (next) => (config.comments.filteredRanks = next),
        ),
      ],
    ),
  );

  app.append(
    section(
      'Standings',
      "Move filtered users into a separate 'Filtered Leaderboard' (e.g. brand-new / unrated accounts).",
      config.standings.enabled,
      (v) => {
        config.standings.enabled = v;
        scheduleSave();
      },
      [
        h('div', { class: 'field-label' }, 'Filter contestants of these ranks'),
        rankSet(
          () => config.standings.filteredRanks,
          (next) => (config.standings.filteredRanks = next),
        ),
      ],
    ),
  );
}

loadConfig().then((c) => {
  config = c;
  render();
});
