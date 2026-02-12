import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    open: true,
  },
});
