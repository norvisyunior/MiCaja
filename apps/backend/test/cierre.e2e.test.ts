import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool, withAdmin } from '../src/db';

const ejecutar = Boolean(process.env.DATABASE_URL && process.env.LICENSE_PRIVATE_KEY);

describe.skipIf(!ejecutar)('cierre y caja E2E', () => {
  const app = createApp();
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const email = `cierre-${sufijo}@test.local`;
  const password = 'ClaveSegura123';
  const ids = {
    usuario: crypto.randomUUID(),
    categoria: crypto.randomUUID(),
    producto: crypto.randomUUID(),
    turno: crypto.randomUUID(),
    gasto: crypto.randomUUID(),
    movimiento: crypto.randomUUID(),
    conteo: crypto.randomUUID(),
  };

  let adminId = '';
  let empresaId = '';
  let empresaAjenaId = '';
  let deviceId = '';
  let token = '';

  beforeAll(async () => {
    if (!ejecutar) return;
    const hash = await bcrypt.hash(password, 4);
    const fila = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into admin_usuarios (email, nombre, password_hash, rol)
         values ($1, 'Admin Cierre', $2, 'superadmin') returning id`,
        [email, hash]
      )
    );
    adminId = fila.rows[0].id;
  });

  afterAll(async () => {
    if (!ejecutar) return;
    for (const id of [empresaId, empresaAjenaId]) {
      if (id) await withAdmin((client) => client.query(`delete from empresas where id = $1`, [id]));
    }
    if (adminId) {
      await withAdmin((client) => client.query(`delete from admin_usuarios where id = $1`, [adminId]));
    }
    await pool.end();
  });

  async function crearNegocio(nombre: string) {
    const login = await request(app).post('/api/admin/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const creada = await request(app)
      .post('/api/admin/empresas')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nombre, propietario: 'Propietario', planCodigo: 'pro' });
    expect(creada.status).toBe(201);
    const activar = await request(app).post('/api/activar').send({
      codigo: creada.body.codigoActivacion,
      fingerprint: `cierre-${nombre}-${sufijo}`,
      nombre: 'Caja',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(activar.status).toBe(201);
    return {
      empresaId: creada.body.empresa.id,
      deviceId: activar.body.dispositivo.id,
      token: activar.body.token,
    };
  }

  it('registra caja, gasto vinculado, conteo y cierre con reembolsos', async () => {
    const negocio = await crearNegocio(`Cierre ${sufijo}`);
    empresaId = negocio.empresaId;
    deviceId = negocio.deviceId;
    token = negocio.token;
    const ahora = new Date().toISOString();

    const operaciones = [
      {
        operationId: crypto.randomUUID(),
        tipo: 'usuario_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.usuario,
          nombre: 'Cajero',
          usuario: `cajero${sufijo}`,
          rol: 'dependiente',
          activo: true,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'categoria_upsert',
        timestamp: Date.now(),
        payload: { id: ids.categoria, nombre: 'Bebidas', color: '#0EA5E9', orden: 0, activo: true, version: 1 },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'producto_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.producto,
          categoriaId: ids.categoria,
          nombre: 'Refresco',
          precio: 5,
          costoUnitario: 2,
          emoji: '🥤',
          color: '#0EA5E9',
          orden: 0,
          activo: true,
          stock: 10,
          stockMinimo: 1,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'turno_apertura',
        timestamp: Date.now(),
        payload: {
          turnoId: ids.turno,
          usuarioId: ids.usuario,
          apertura: ahora,
          fondoInicial: 100,
          desglose: {},
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'movimiento_caja_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.movimiento,
          turnoId: ids.turno,
          usuarioId: ids.usuario,
          tipo: 'entrada',
          monto: 50,
          descripcion: 'Depósito inicial extra',
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'gasto_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.gasto,
          categoria: 'electricidad',
          concepto: 'Luz',
          monto: 10,
          fecha: ahora,
          formaPago: 'efectivo',
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'conteo_inventario_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.conteo,
          turnoId: ids.turno,
          productoId: ids.producto,
          cantidadSistema: 10,
          cantidadContada: 13,
          diferencia: 3,
          motivo: 'Sobrante encontrado',
          usuarioId: ids.usuario,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'venta',
        timestamp: Date.now(),
        payload: {
          localId: crypto.randomUUID(),
          usuarioId: ids.usuario,
          turnoId: ids.turno,
          fechaCliente: ahora,
          subtotal: 30,
          descuentoPct: 0,
          total: 30,
          formaPago: 'efectivo',
          montoEfectivo: 30,
          montoDigital: 0,
          items: [
            {
              productoId: ids.producto,
              nombre: 'Refresco',
              precioUnitario: 5,
              costoUnitario: 2,
              cantidad: 6,
              subtotal: 30,
            },
          ],
        },
      },
    ];

    const push = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, operations: operaciones });
    expect(push.status).toBe(200);
    for (const resultado of push.body.results) {
      expect(resultado.estado, resultado.error).toBe('aplicada');
    }

    const cierre = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'turno_cierre',
            timestamp: Date.now(),
            payload: {
              turnoId: ids.turno,
              cierre: ahora,
              ventasCount: 1,
              totalEsperado: 30,
              desglose: {
                fondo_inicial: 100,
                ventas_efectivo: 30,
                entradas_efectivo: 50,
                efectivo_total: 130,
                digital_total: 0,
              },
              dineroReal: 128,
              diferencia: -2,
              efectivoEsperado: 130,
              observacion: 'Faltaron 2',
            },
          },
        ],
      });
    expect(cierre.status).toBe(200);
    expect(cierre.body.results[0].estado).toBe('aplicada');

    const fila = await withAdmin((client) =>
      client.query<{
        fondo_inicial: string;
        efectivo_esperado: string;
        dinero_real: string;
        diferencia: string;
        observacion_diferencia: string;
        estado: string;
      }>(
        `select fondo_inicial, efectivo_esperado, dinero_real, diferencia,
                observacion_diferencia, estado::text
         from turnos_caja where empresa_id = $1 and id = $2`,
        [empresaId, ids.turno]
      )
    );
    expect(Number(fila.rows[0].fondo_inicial)).toBe(100);
    expect(Number(fila.rows[0].efectivo_esperado)).toBe(130);
    expect(Number(fila.rows[0].dinero_real)).toBe(128);
    expect(Number(fila.rows[0].diferencia)).toBe(-2);
    expect(fila.rows[0].observacion_diferencia).toBe('Faltaron 2');
    expect(fila.rows[0].estado).toBe('cerrado');

    const gasto = await withAdmin((client) =>
      client.query<{ forma_pago: string; categoria: string }>(
        `select forma_pago, categoria from gastos where empresa_id = $1 and id = $2`,
        [empresaId, ids.gasto]
      )
    );
    expect(gasto.rows[0].forma_pago).toBe('efectivo');
    expect(gasto.rows[0].categoria).toBe('electricidad');

    const movimientos = await withAdmin((client) =>
      client.query<{ total: number }>(
        `select count(*)::int as total from movimientos_caja where empresa_id = $1`,
        [empresaId]
      )
    );
    expect(movimientos.rows[0].total).toBe(1);

    const conteos = await withAdmin((client) =>
      client.query<{ diferencia: string }>(
        `select diferencia from conteos_inventario where empresa_id = $1 and id = $2`,
        [empresaId, ids.conteo]
      )
    );
    expect(Number(conteos.rows[0].diferencia)).toBe(3);

    const pull = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId })
      .set('Authorization', `Bearer ${token}`);
    expect(pull.status).toBe(200);
    expect(
      pull.body.cambios.some((c: { tipo: string; id: string }) =>
        c.tipo === 'movimiento_caja' && c.id === ids.movimiento
      )
    ).toBe(true);
    expect(
      pull.body.cambios.some((c: { tipo: string; id: string }) =>
        c.tipo === 'conteo_inventario' && c.id === ids.conteo
      )
    ).toBe(true);

    const ajena = await crearNegocio(`Ajena ${sufijo}`);
    empresaAjenaId = ajena.empresaId;
    const pullAjena = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: ajena.deviceId })
      .set('Authorization', `Bearer ${ajena.token}`);
    expect(pullAjena.status).toBe(200);
    expect(
      pullAjena.body.cambios.some((c: { tipo: string; id: string }) =>
        c.tipo === 'movimiento_caja' && c.id === ids.movimiento
      )
    ).toBe(false);

    const cierreDuplicado = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'turno_cierre',
            timestamp: Date.now() + 1,
            payload: {
              turnoId: ids.turno,
              cierre: ahora,
              ventasCount: 99,
              totalEsperado: 999,
              desglose: {},
              dineroReal: 1,
              diferencia: 0,
              efectivoEsperado: 0,
            },
          },
        ],
      });
    expect(cierreDuplicado.status).toBe(200);
    expect(cierreDuplicado.body.results[0].resultado.idempotente).toBe(true);
  });
});
