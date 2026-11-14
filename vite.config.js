import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/interfaces/web/', import.meta.url)),
  // En desarrollo, /api va a la API (`npm start`, puerto 3000).
  server: { proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000' } },
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
  },
});
