import { defineConfig } from 'wxt';

// Vanilla TS extension (no UI framework module needed).
// Default target is Chrome/Chromium MV3; `wxt -b firefox` builds Firefox.
export default defineConfig({
  manifest: {
    name: 'Graytist',
    description:
      'Filter Codeforces Recent Actions, comments, and standings by rating tier and keywords.',
    permissions: ['storage'],
  },
});
