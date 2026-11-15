import { Router } from 'express';
import { env } from '../config';
import { pool } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  if (!env.DATABASE_URL) {
    res.json({
      status: 'ok',
      db: 'no_configurada',
      version: '0.1.0',
      serverTime: new Date().toISOString(),
    });
    return;
  }

  try {
    await pool.query('select 1');
    res.json({
      status: 'ok',
      db: 'ok',
      version: '0.1.0',
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[micaja-api] health db', error);
    res.status(503).json({
      status: 'degradado',
      db: 'error',
      serverTime: new Date().toISOString(),
    });
  }
});
