import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// En desarrollo, /api se reenvía a la API HTTP de AgroFlow (npm run dev:api, puerto 3000).
const API_URL = process.env.AGROFLOW_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  root: fileURLToPath(new URL('./src/interfaces/web/', import.meta.url)),
  server: {
    proxy: { '/api': { target: API_URL, changeOrigin: true } },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
  },
});
