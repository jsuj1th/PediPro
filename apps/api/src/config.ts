import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootPath = path.resolve(__dirname, '../../..');
const dataPath = process.env.DATA_PATH ?? path.join(rootPath, 'apps', 'data');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  dbPath: process.env.DB_PATH ?? path.join(dataPath, 'pediform.db'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  rootPath,
  dataPath,
};
