/**
 * Charge toujours le `.env` à la racine du dépôt (parent de `server/`),
 * quel que soit le répertoire depuis lequel `node server/dev.mjs` est lancé.
 * Sans cela, des variables du `.env` peuvent être ignorées si le répertoire courant n’est pas la racine du projet.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
