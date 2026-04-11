import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { seedDefaults } from './db/seed.js';
import { publicRouter } from './routes/public.js';
import { parentAuthRouter } from './routes/parentAuth.js';
import { staffRouter } from './routes/staff.js';
import { staffTemplatesRouter } from './routes/staffTemplates.js';
import { authMiddleware } from './middleware/auth.js';
import { fail } from './lib/response.js';

runMigrations();
seedDefaults();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pediform-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', publicRouter);
app.use('/api/parent', parentAuthRouter);
app.use('/api/staff', staffRouter);
app.use('/api/staff/templates', authMiddleware('staff'), staffTemplatesRouter);

app.use((_req, res) => {
  fail(res, 'NOT_FOUND', 'Route not found', 404);
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${config.port}`);
});
