import { defineConfig } from 'wxt';

// Vanilla TS extension (no UI framework module needed).
// Default target is Chrome/Chromium MV3; `wxt -b firefox` builds Firefox (MV2).
export default defineConfig({
  // The Firefox sources zip (for AMO review) otherwise sweeps in tmp/ (saved CF
  // pages, an 18 MB perf trace, the source logos) and assets/ (README art) — none
  // of which is needed to build. Keep the sources zip to actual sources.
  zip: {
    excludeSources: ['tmp/**', 'assets/**'],
  },
  manifest: ({ browser }) => ({
    name: 'GRAYtist',
    description:
      'Filter Codeforces Recent Actions, comments, and standings by rating tier and keywords.',
    permissions: ['storage'],
    // Firefox-only. Two things the Chrome build doesn't need:
    //  - gecko.id: storage.sync silently fails to persist on Firefox without an
    //    explicit add-on ID.
    //  - data_collection_permissions: required for new AMO submissions; GRAYtist
    //    collects nothing, so 'none'.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'graytist@welcome-to-the-sunny-side.github.io',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
