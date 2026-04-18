/**
 * Charge le .env avant toute API.
 * Les routes /api/* en dev sont montées via import() dynamique vers un fichier **non**
 * bundlé par Vite — sinon Prisma (`@prisma/client`) finit `undefined` dans le bundle
 * `.vite-temp/vite.config.*.mjs`.
 */
import './server/load-env.mjs';
import { defineConfig } from 'vite';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const apiRoutesUrl = pathToFileURL(path.join(root, 'server', 'api-routes.mjs')).href;

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [
    {
      name: 'api-routes-dev',
      enforce: 'pre',
      configureServer(server) {
        let apiApp = null;
        let initPromise = null;

        function ensureApi() {
          if (apiApp) return Promise.resolve(apiApp);
          if (!initPromise) {
            initPromise = (async () => {
              const { registerApiRoutes } = await import(apiRoutesUrl);
              const app = express();
              app.use(express.json({ limit: '1mb' }));
              registerApiRoutes(app);
              apiApp = app;
              return apiApp;
            })();
          }
          return initPromise;
        }

        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/api')) {
            next();
            return;
          }
          ensureApi()
            .then((app) => app(req, res, next))
            .catch(next);
        });
      },
    },
  ],
});
