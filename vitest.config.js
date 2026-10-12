import { fileURLToPath } from 'node:url';

// `transformWithOxc` is only exported by vite, which vitest brings in; the
// lockfile pins it, and it is the transform vitest itself runs on.
import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // The components are `.js` files holding JSX, which Next compiles and
      // vite does not: its transform reads JSX only from `.jsx`. Without
      // this a test cannot import one, and what a component renders -- a link
      // or a button, an aria attribute, a note shown only sometimes -- has
      // only ever been checked by hand in a browser. Render with
      // `renderToStaticMarkup` from `react-dom/server`; no DOM is needed.
      name: 'jsx-in-js',
      enforce: 'pre',
      transform(code, id) {
        if (!/\/(components|app)\/[^?]*\.js$/.test(id)) return null;
        return transformWithOxc(code, id, { lang: 'jsx', jsx: { runtime: 'automatic' } });
      },
    },
  ],
  resolve: {
    // Mirrors the "@/*" alias in jsconfig.json so tests import modules by the
    // same path the application does.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
  },
});
