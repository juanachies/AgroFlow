import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const webRoot = fileURLToPath(new URL('./src/interfaces/web/', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const authUrl = env.VITE_NEON_AUTH_URL ?? env.NEON_AUTH_BASE_URL ?? '';
  return {
    root: webRoot,
    envDir: projectRoot,
    define: {
      'import.meta.env.VITE_NEON_AUTH_URL': JSON.stringify(authUrl),
    },
    server: { proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000' } },
    build: {
      outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
      emptyOutDir: true,
    },
  };
});
