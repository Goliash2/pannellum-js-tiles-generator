import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PannellumTilesGenerator',
      formats: ['es', 'umd'],
      fileName: 'pannellum-js-tiles-generator',
    },
    rollupOptions: {
      // Three.js is bundled — it's required for the library to work
      // fflate is also bundled for ease of use
      output: {
        globals: {},
      },
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
});
