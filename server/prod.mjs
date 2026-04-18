/**
 * Production : API `/api/*` + fichiers statiques `dist/` (build Vite) + fallback SPA.
 * Usage : `npm start` ou `node server/prod.mjs` — écoute `PORT` (défaut 3000).
 */
import './load-env.mjs';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerApiRoutes } from './api-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const indexHtml = path.join(dist, 'index.html');

const app = express();
app.use(express.json({ limit: '1mb' }));
registerApiRoutes(app);

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(404).end();
  }
  const rel = req.path.replace(/^\//, '');
  const safe = path
    .normalize(rel)
    .replace(/^(\.\.([/\\]|$))+/, '')
    .replace(/^[/\\]+/, '');
  const filePath = path.join(dist, safe);
  if (safe && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  return res.sendFile(indexHtml, (err) => next(err));
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).end();
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[prod] http://0.0.0.0:${port}  (static: ${dist})`);
});
