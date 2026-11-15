import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).default('dev-secret-cambiar-en-produccion-1234567890'),
  JWT_EXPIRES_ADMIN: z.string().default('12h'),
  JWT_EXPIRES_DEVICE: z.string().default('90d'),
  LICENSE_PRIVATE_KEY: z.string().optional(),
  LICENSE_KEY_ID: z.string().default('v1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);
