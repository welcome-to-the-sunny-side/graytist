import { defineContentScript } from '#imports';
import { loadConfig, watchConfig, type GraytistConfig } from '@/lib/config';
import { runRecentActions } from '@/lib/features/recentActions';
import { runComments } from '@/lib/features/comments';
import { runStandings } from '@/lib/features/standings';
import { log } from '@/lib/log';

export default defineContentScript({
  matches: ['*://codeforces.com/*', '*://*.codeforces.com/*'],
  // document_idle: run after the page's own scripts have settled, so we don't race
  // Codeforces' load-time JS (e.g. restoring a comment's collapse state on top of ours).
  runAt: 'document_idle',
  main() {
    let config: GraytistConfig | null = null;

    // Codeforces is a server-rendered, multi-page site: everything we filter is in the
    // initial HTML and doesn't live-update without a reload (and each navigation is a full
    // page load that re-runs this script). So we apply once on load and again on each
    // config change — no MutationObserver. The passes are idempotent and self-gating, so
    // the config-change re-run cleanly re-partitions or restores.
    const pass = () => {
      if (!config) return;
      runRecentActions(config);
      runComments(config);
      runStandings(config);
    };

    loadConfig().then((loaded) => {
      config = loaded;
      log.info('active', config);
      pass();
      watchConfig((next) => {
        config = next;
        log.debug('config updated');
        pass();
      });
    });
  },
});
