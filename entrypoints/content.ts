import { defineContentScript } from '#imports';
import { loadConfig, watchConfig, type GraytistConfig } from '@/lib/config';
import { observeDom } from '@/lib/dom';
import { runRecentActions } from '@/lib/features/recentActions';
import { runComments } from '@/lib/features/comments';
import { runStandings } from '@/lib/features/standings';
import { log } from '@/lib/log';

export default defineContentScript({
  matches: ['*://codeforces.com/*', '*://*.codeforces.com/*'],
  runAt: 'document_end',
  main() {
    let config: GraytistConfig | null = null;

    // Each pass is idempotent and self-gating (a disabled feature cleans itself up), so
    // we can safely re-run on every DOM change. Passes converge to a no-op at steady state.
    const pass = () => {
      if (!config) return;
      runRecentActions(config);
      runComments(config);
      runStandings(config);
    };

    loadConfig().then((loaded) => {
      config = loaded;
      log.info('active', config);
      observeDom(pass, { debounceMs: 150 });
      watchConfig((next) => {
        config = next;
        log.debug('config updated');
        pass(); // re-partition immediately on settings change
      });
    });
  },
});
