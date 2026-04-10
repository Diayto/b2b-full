import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const paths = {
  ROOT_DIR,
  DATA_DIR: path.resolve(ROOT_DIR, '../data'),
  MIGRATIONS_DIR: path.resolve(ROOT_DIR, 'db/migrations'),
};
