/**
 * Un seul processus : API Prisma (/api/*) + Vite (HMR, SPA).
 * Usage : npm run dev
 *
 * Par défaut : **un seul port** (5173 ou PORT). Si ce port est pris, on **arrête**
 * avec un message clair — sinon le serveur bascule sur 5174… et le navigateur
 * reste souvent sur 5173, ce qui affiche **une autre app**.
 *
 * Pour réessayer d’autres ports automatiquement : DEV_PORT_FALLBACK=1 npm run dev
 *
 * Note : `vite` seul utilise aussi les routes API via `vite.config.js` (plugin).
 */
import './load-env.mjs';
import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

import { registerApiRoutes } from './api-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const app = express();
app.use(express.json({ limit: '1mb' }));
registerApiRoutes(app);

const server = http.createServer(app);

const vite = await createViteServer({
  root,
  appType: 'spa',
  server: {
    middlewareMode: true,
    hmr: { server },
  },
});

app.use(vite.middlewares);

const basePort = Number(process.env.PORT || 5173);
const allowFallback = process.env.DEV_PORT_FALLBACK === '1' || process.env.DEV_PORT_FALLBACK === 'true';

function listenOnce(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') resolve({ busy: true });
      else reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve({ busy: false, port });
    };
    server.once('error', onError);
    server.listen(port, onListening);
  });
}

async function start() {
  if (allowFallback) {
    for (let p = basePort; p < basePort + 15; p++) {
      const r = await listenOnce(p);
      if (!r.busy) {
        printReady(r.port);
        return;
      }
      console.warn(`⚠️  Port ${p} déjà utilisé → essai sur ${p + 1}`);
    }
    console.error(
      '\nAucun port libre dans la plage. Essayez : npm run dev:kill puis npm run dev\n',
    );
    process.exit(1);
    return;
  }

  const r = await listenOnce(basePort);
  if (r.busy) {
    console.error(`
❌ Le port ${basePort} est déjà utilisé.

   Le navigateur sur http://localhost:${basePort} peut alors montrer **une autre application**
   (autre projet, ancien serveur), pas cette app.

   → Libérez le port :  npm run dev:kill
   → Puis relancez :     npm run dev

   Ou choisissez un port libre :  PORT=5180 npm run dev
   (et ouvrez exactement l’URL affichée dans le terminal)

   (Pour l’ancien comportement multi-ports : DEV_PORT_FALLBACK=1 npm run dev)
`);
    process.exit(1);
  }
  printReady(r.port);
}

function printReady(port) {
  console.log('');
  console.log(`  LA FORGE-HUB — front + API`);
  console.log(`  → http://127.0.0.1:${port}`);
  console.log(`  → http://localhost:${port}`);
  console.log('');
}

await start();
