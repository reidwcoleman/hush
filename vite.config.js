import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GH_PAGES ? '/hush/' : '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
});
