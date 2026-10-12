import { fileURLToPath } from 'node:url';

// `transformWithOxc` is only exported by vite, so vite is a dependency of its
// own here, and it is the transform vitest itself runs on.
import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

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
        if (!/\.js$/.test(id) || !['components/', 'app/'].some((dir) => id.startsWith(root + dir))) return null;
        return transformWithOxc(code, id, { lang: 'jsx', jsx: { runtime: 'automatic' } });
      },
    },
  ],
  resolve: {
    // Mirrors the "@/*" alias in jsconfig.json so tests import modules by the
    // same path the application does.
    alias: {
      '@': root,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
  },
});
