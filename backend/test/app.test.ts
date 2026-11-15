import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('API', () => {
  const app = createApp();

  it('responde el health check', async () => {
    const respuesta = await request(app).get('/health');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe('ok');
  });

  it('protege las rutas de administración', async () => {
    const respuesta = await request(app).get('/api/admin/empresas');
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toBe('TOKEN_REQUERIDO');
  });

  it('protege las rutas de sincronización', async () => {
    const respuesta = await request(app).get('/api/sync/pull?deviceId=22222222-2222-4222-8222-222222222222');
    expect(respuesta.status).toBe(401);
  });

  it('devuelve 404 en rutas desconocidas', async () => {
    const respuesta = await request(app).get('/no-existe');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
  });
});
