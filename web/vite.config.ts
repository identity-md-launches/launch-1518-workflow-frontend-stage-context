import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'verified-deployment-in-development',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (path !== '/imd-deployment.json' && !/^\/abi\/[A-Za-z0-9_-]+\.json$/.test(path || '')) return next();
        const file = fileURLToPath(new URL(`../dist${path}`, import.meta.url));
        void readFile(file).then(bytes => {
          response.setHeader('Content-Type', 'application/json');
          response.end(bytes);
        }).catch(() => {
          response.statusCode = 503;
          response.end('Run npm run build first to create the verified deployment export.');
        });
      });
    },
  }],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
});
