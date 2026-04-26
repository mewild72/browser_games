import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  // Critical for file:// portability — emit relative asset paths in dist/index.html
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Inline EVERYTHING (JS, CSS, fonts, WebP card art) into dist/index.html
    // so the build is a single self-contained file that loads from file://
    // without CORS errors on chunked module imports.
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
