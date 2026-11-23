import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { corsOrigins, env } from './config';
import { errorHandler, notFound } from './middleware/errors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { authUsuarioRouter } from './routes/auth-usuario';
import { empresasRouter } from './routes/empresas';
import { licenciasRouter } from './routes/licencias';
import { activacionRouter } from './routes/activacion';
import { registroRouter } from './routes/registro';
import { syncRouter } from './routes/sync';
import { deviceRouter } from './routes/device';
import { reportesRouter } from './routes/reportes';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: false,
    })
  );
  app.use(express.json({ limit: '6mb' }));

  app.use(healthRouter);

  const limitador = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
  });
  app.use('/api', limitador);

  app.use('/api/admin/auth', authRouter);
  app.use('/api/admin/empresas', empresasRouter);
  app.use('/api/admin/licencias', licenciasRouter);
  app.use('/api/auth', authUsuarioRouter);
  app.use('/api', activacionRouter);
  app.use('/api', registroRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/device', deviceRouter);
  app.use('/api/reportes', reportesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
