import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  dbPath: process.env.DB_PATH ?? path.resolve(__dirname, '../../data/pediform.db'),
  rootPath: path.resolve(__dirname, '../../..'),
};
