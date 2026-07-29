import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: 'client',
  plugins: [svelte({ compilerOptions: { runes: true } })],
  resolve: {
    alias: [
      {
        find: /^three\/addons\/(.*)$/,
        replacement: fileURLToPath(
          new URL('./client/vendor/examples/jsm/$1', import.meta.url),
        ),
      },
      {
        find: 'three',
        replacement: fileURLToPath(
          new URL('./client/vendor/build/three.module.js', import.meta.url),
        ),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssMinify: false,
    chunkSizeWarningLimit: 700,
  },
});
