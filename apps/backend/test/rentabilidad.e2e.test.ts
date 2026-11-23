import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool, withAdmin } from '../src/db';

const ejecutar = Boolean(process.env.DATABASE_URL && process.env.LICENSE_PRIVATE_KEY);

describe.skipIf(!ejecutar)('rentabilidad E2E', () => {
  const app = createApp();
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const email = `rentabilidad-${sufijo}@test.local`;
  const password = 'ClaveSegura123';
  const ids = {
    usuario: crypto.randomUUID(),
    categoria: crypto.randomUUID(),
    producto: crypto.randomUUID(),
    turno: crypto.randomUUID(),
    venta: crypto.randomUUID(),
    gasto: crypto.randomUUID(),
  };

  let adminId = '';
  let empresaId = '';
  let empresaAjenaId = '';

  beforeAll(async () => {
    if (!ejecutar) return;
    const hash = await bcrypt.hash(password, 4);
    const fila = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into admin_usuarios (email, nombre, password_hash, rol)
         values ($1, 'Admin Rentabilidad', $2, 'superadmin')
         returning id`,
        [email, hash]
      )
    );
    adminId = fila.rows[0].id;
  });

  afterAll(async () => {
    if (!ejecutar) return;
    if (empresaId) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaId])
      );
    }
    if (empresaAjenaId) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaAjenaId])
      );
    }
    if (adminId) {
      await withAdmin((client) =>
        client.query(`delete from admin_usuarios where id = $1`, [adminId])
      );
    }
    await pool.end();
  });

  async function entrar(): Promise<string> {
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    return login.body.token as string;
  }

  async function crearEmpresaYActivar(nombre: string): Promise<{
    empresaId: string;
    deviceId: string;
    token: string;
  }> {
    const tokenAdmin = await entrar();
    const creada = await request(app)
      .post('/api/admin/empresas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre, propietario: 'Propietario', planCodigo: 'pro' });
    expect(creada.status).toBe(201);
    const activar = await request(app).post('/api/activar').send({
      codigo: creada.body.codigoActivacion,
      fingerprint: `rent-${nombre}-${sufijo}`,
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

  it('calcula ventas netas, costo congelado, gastos, descuento y anulación', async () => {
    const negocio = await crearEmpresaYActivar(`Rent ${sufijo}`);
    empresaId = negocio.empresaId;
    const ahora = new Date().toISOString();
    const desde = new Date(Date.now() - 60_000).toISOString();
    const hasta = new Date(Date.now() + 60_000).toISOString();

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
        payload: {
          id: ids.categoria,
          nombre: 'Bebidas',
          color: '#0EA5E9',
          orden: 0,
          activo: true,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'producto_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.producto,
          categoriaId: ids.categoria,
          nombre: 'Café',
          precio: 10,
          costoUnitario: 4,
          emoji: '☕',
          color: '#0EA5E9',
          orden: 0,
          activo: true,
          stockMinimo: 1,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'movimiento_inventario',
        timestamp: Date.now(),
        payload: {
          movimientoId: crypto.randomUUID(),
          productoId: ids.producto,
          tipo: 'inicial',
          cantidad: 10,
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
          fondoInicial: 0,
          desglose: {},
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'venta',
        timestamp: Date.now(),
        payload: {
          localId: ids.venta,
          usuarioId: ids.usuario,
          turnoId: ids.turno,
          fechaCliente: ahora,
          subtotal: 40,
          descuentoPct: 10,
          total: 36,
          formaPago: 'efectivo',
          montoEfectivo: 36,
          montoDigital: 0,
          items: [
            {
              productoId: ids.producto,
              nombre: 'Café',
              precioUnitario: 10,
              costoUnitario: 4,
              cantidad: 2,
              subtotal: 20,
            },
            {
              productoId: null,
              nombre: 'Servicio sin costo',
              precioUnitario: 20,
              cantidad: 1,
              subtotal: 20,
            },
          ],
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'gasto_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.gasto,
          categoria: 'transporte',
          concepto: 'Combustible',
          monto: 5,
          fecha: ahora,
          version: 1,
        },
      },
    ];

    const push = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${negocio.token}`)
      .send({ deviceId: negocio.deviceId, operations: operaciones });
    expect(push.status).toBe(200);
    expect(push.body.results).toHaveLength(operaciones.length);
    for (const resultado of push.body.results) {
      expect(resultado.estado, resultado.error).toBe('aplicada');
    }

    const reporteRes = await request(app)
      .get('/api/reportes/rentabilidad')
      .query({ desde, hasta })
      .set('Authorization', `Bearer ${negocio.token}`);
    expect(reporteRes.status).toBe(200);
    const reporte = reporteRes.body;
    expect(reporte.ventas.cantidad).toBe(1);
    expect(reporte.ventas.total).toBe(36);
    expect(reporte.ventas.subtotal).toBe(40);
    expect(reporte.costoVentas).toBe(8);
    expect(reporte.gananciaBruta).toBe(28);
    expect(reporte.gastos.total).toBe(5);
    expect(reporte.gastos.porCategoria.find((f: { categoria: string }) => f.categoria === 'transporte').total).toBe(5);
    expect(reporte.gananciaNeta).toBe(23);
    expect(reporte.lineasSinCosto).toBe(1);
    expect(reporte.ventasSinCosto).toBe(1);

    const cafe = reporte.ranking.find((f: { nombre: string }) => f.nombre === 'Café');
    expect(cafe.ventas).toBe(18);
    expect(cafe.costo).toBe(8);
    expect(cafe.ganancia).toBe(10);
    expect(cafe.sinCosto).toBe(false);

    const servicio = reporte.ranking.find(
      (f: { nombre: string }) => f.nombre === 'Servicio sin costo'
    );
    expect(servicio.ventas).toBe(18);
    expect(servicio.sinCosto).toBe(true);

    const pull = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: negocio.deviceId })
      .set('Authorization', `Bearer ${negocio.token}`);
    expect(pull.status).toBe(200);
    const gasto = pull.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'gasto' && cambio.id === ids.gasto
    );
    expect(gasto).toBeTruthy();
    expect(gasto.data.concepto).toBe('Combustible');
    expect(gasto.data.monto).toBe(5);

    const anulacion = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${negocio.token}`)
      .send({
        deviceId: negocio.deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'anulacion',
            timestamp: Date.now(),
            payload: {
              ventaId: ids.venta,
              usuarioId: ids.usuario,
              motivo: 'Prueba de rentabilidad',
            },
          },
        ],
      });
    expect(anulacion.status).toBe(200);
    expect(anulacion.body.results[0].estado).toBe('aplicada');

    const trasAnular = await request(app)
      .get('/api/reportes/rentabilidad')
      .query({ desde, hasta })
      .set('Authorization', `Bearer ${negocio.token}`);
    expect(trasAnular.status).toBe(200);
    expect(trasAnular.body.ventas.total).toBe(0);
    expect(trasAnular.body.costoVentas).toBe(0);
    expect(trasAnular.body.gastos.total).toBe(5);
    expect(trasAnular.body.gananciaNeta).toBe(-5);

    const invitacion = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${negocio.token}`)
      .send({ rol: 'dependiente', expiraHoras: 24 });
    expect(invitacion.status).toBe(201);
    const trabajador = await request(app).post('/api/activar').send({
      codigo: invitacion.body.codigo,
      fingerprint: `rent-worker-${sufijo}`,
      nombre: 'Caja trabajador',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(trabajador.status).toBe(201);

    const reporteDependiente = await request(app)
      .get('/api/reportes/rentabilidad')
      .query({ desde, hasta })
      .set('Authorization', `Bearer ${trabajador.body.token}`);
    expect(reporteDependiente.status).toBe(403);
    expect(reporteDependiente.body.error).toBe('ROL_INSUFICIENTE');

    const gastoDependiente = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${trabajador.body.token}`)
      .send({
        deviceId: trabajador.body.dispositivo.id,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'gasto_upsert',
            timestamp: Date.now(),
            payload: {
              id: crypto.randomUUID(),
              categoria: 'otros',
              concepto: 'Gasto de trabajador',
              monto: 1,
              fecha: ahora,
              version: 1,
            },
          },
        ],
      });
    expect(gastoDependiente.status).toBe(200);
    expect(gastoDependiente.body.results[0].estado).toBe('rechazada');
    expect(gastoDependiente.body.results[0].error).toContain('ROL_INSUFICIENTE');

    const ajena = await crearEmpresaYActivar(`Ajena ${sufijo}`);
    empresaAjenaId = ajena.empresaId;
    const reporteAjeno = await request(app)
      .get('/api/reportes/rentabilidad')
      .query({ desde, hasta })
      .set('Authorization', `Bearer ${ajena.token}`);
    expect(reporteAjeno.status).toBe(200);
    expect(reporteAjeno.body.ventas.total).toBe(0);
    expect(reporteAjeno.body.gastos.total).toBe(0);
    expect(reporteAjeno.body.ranking).toHaveLength(0);
  });
});
