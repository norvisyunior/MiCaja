import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeLicenseToken } from '@micaja/shared';
import { createApp } from '../src/app';
import { env } from '../src/config';
import { pool, withAdmin } from '../src/db';
import { verificarLicenciaConClave } from '../src/services/licencias';

const ejecutar = Boolean(process.env.DATABASE_URL && process.env.LICENSE_PRIVATE_KEY);

describe.skipIf(!ejecutar)('flujo E2E de activación y sincronización', () => {
  const app = createApp();
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${sufijo}@test.local`;
  const password = 'ClaveSegura123';
  const ids = {
    usuario: crypto.randomUUID(),
    categoria: crypto.randomUUID(),
    producto: crypto.randomUUID(),
    turno: crypto.randomUUID(),
    ventaLocal: crypto.randomUUID(),
    movimiento: crypto.randomUUID(),
  };

  let adminId = '';
  let empresaId = '';
  let empresaRegistroId = '';
  let deviceId = '';
  let deviceToken = '';
  let codigoActivacion = '';

  beforeAll(async () => {
    if (!ejecutar) return;

    const hash = await bcrypt.hash(password, 4);
    const admin = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into admin_usuarios (email, nombre, password_hash, rol)
         values ($1, 'Admin E2E', $2, 'superadmin')
         returning id`,
        [email, hash]
      )
    );
    adminId = admin.rows[0].id;
  });

  afterAll(async () => {
    if (!ejecutar) return;

    if (empresaId) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaId])
      );
    }
    if (empresaRegistroId) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaRegistroId])
      );
    }
    if (adminId) {
      await withAdmin((client) =>
        client.query(`delete from admin_usuarios where id = $1`, [adminId])
      );
    }
    await pool.end();
  });

  it('crea empresa, activa dispositivo, sincroniza venta y stock', async () => {
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    const adminToken = login.body.token as string;

    const crear = await request(app)
      .post('/api/admin/empresas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: `Empresa E2E ${sufijo}`,
        propietario: 'Propietario E2E',
        planCodigo: 'pro',
      });
    expect(crear.status).toBe(201);
    empresaId = crear.body.empresa.id;
    codigoActivacion = crear.body.codigoActivacion;
    expect(codigoActivacion).toMatch(/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const activar = await request(app).post('/api/activar').send({
      codigo: codigoActivacion,
      fingerprint: `fingerprint-${sufijo}`,
      nombre: 'Caja E2E',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(activar.status).toBe(201);
    deviceToken = activar.body.token;
    deviceId = activar.body.dispositivo.id;

    const privada = crypto.createPrivateKey({
      key: Buffer.from(env.LICENSE_PRIVATE_KEY!, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const publica = crypto
      .createPublicKey(privada)
      .export({ format: 'der', type: 'spki' })
      .toString('base64');

    expect(verificarLicenciaConClave(activar.body.licencia, publica)).toBe(true);
    expect(decodeLicenseToken(activar.body.licencia).deviceId).toBe(deviceId);

    const reactivar = await request(app).post('/api/activar').send({
      codigo: codigoActivacion,
      fingerprint: `fingerprint-${sufijo}`,
      nombre: 'Caja E2E',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(reactivar.status).toBe(201);
    expect(reactivar.body.dispositivo.id).toBe(deviceId);
    expect(verificarLicenciaConClave(reactivar.body.licencia, publica)).toBe(true);

    const ahora = new Date().toISOString();
    const operaciones = [
      {
        operationId: crypto.randomUUID(),
        tipo: 'usuario_upsert',
        timestamp: Date.now(),
        payload: {
          id: ids.usuario,
          nombre: 'Cajero E2E',
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
          nombre: 'Café E2E',
          precio: 10,
          emoji: '☕',
          color: '#0EA5E9',
          orden: 0,
          activo: true,
          stockMinimo: 2,
          version: 1,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'movimiento_inventario',
        timestamp: Date.now(),
        payload: {
          movimientoId: ids.movimiento,
          productoId: ids.producto,
          tipo: 'inicial',
          cantidad: 20,
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
          localId: ids.ventaLocal,
          usuarioId: ids.usuario,
          turnoId: ids.turno,
          fechaCliente: ahora,
          subtotal: 20,
          descuentoPct: 0,
          total: 20,
          formaPago: 'efectivo',
          montoEfectivo: 20,
          montoDigital: 0,
          items: [
            {
              productoId: ids.producto,
              nombre: 'Café E2E',
              precioUnitario: 10,
              cantidad: 2,
              subtotal: 20,
            },
          ],
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'turno_cierre',
        timestamp: Date.now(),
        payload: {
          turnoId: ids.turno,
          cierre: ahora,
          ventasCount: 1,
          totalEsperado: 20,
          desglose: { efectivo: 20 },
          dineroReal: 20,
          diferencia: 0,
        },
      },
      {
        operationId: crypto.randomUUID(),
        tipo: 'settings_upsert',
        timestamp: Date.now(),
        payload: { clave: 'moneda', valor: 'CUP', version: 1 },
      },
    ];

    const push = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ deviceId, operations: operaciones });

    expect(push.status).toBe(200);
    expect(push.body.results).toHaveLength(operaciones.length);
    for (const resultado of push.body.results) {
      expect(resultado.estado, resultado.error).toBe('aplicada');
    }

    const resultadoVenta = push.body.results.find(
      (fila: { operationId: string }) => fila.operationId === operaciones[5].operationId
    );
    expect(resultadoVenta.resultado.numero).toBe(1);
    expect(resultadoVenta.resultado.total).toBe(20);

    const pull = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(pull.status).toBe(200);

    const producto = pull.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'producto' && cambio.id === ids.producto
    );
    expect(producto.data.stock).toBe(18);

    const setting = pull.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'setting' && cambio.id === 'moneda'
    );
    expect(setting.data.valor).toBe('CUP');
    expect(pull.body.licencia.estado).toBe('activa');

    const repetida = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        operations: [
          {
            ...operaciones[5],
            operationId: crypto.randomUUID(),
          },
        ],
      });
    expect(repetida.status).toBe(200);
    expect(repetida.body.results[0].estado).toBe('aplicada');
    expect(repetida.body.results[0].resultado.idempotente).toBe(true);
    expect(repetida.body.results[0].resultado.numero).toBe(1);

    const mismaOperacion = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ deviceId, operations: [operaciones[5]] });
    expect(mismaOperacion.status).toBe(200);
    expect(mismaOperacion.body.results[0].resultado.numero).toBe(1);

    const stock = await withAdmin((client) =>
      client.query<{ stock_actual: string }>(
        `select stock_actual from productos where id = $1`,
        [ids.producto]
      )
    );
    expect(Number(stock.rows[0].stock_actual)).toBe(18);

    const ventas = await withAdmin((client) =>
      client.query<{ total: number }>(
        `select count(*)::int as total from ventas where empresa_id = $1`,
        [empresaId]
      )
    );
    expect(ventas.rows[0].total).toBe(1);

    const movimientos = await withAdmin((client) =>
      client.query<{ total: number }>(
        `select count(*)::int as total from movimientos_inventario where empresa_id = $1`,
        [empresaId]
      )
    );
    expect(movimientos.rows[0].total).toBe(2);

    const licencia = await request(app)
      .get('/api/device/licencia')
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(licencia.status).toBe(200);
    expect(licencia.body.estado).toBe('activa');
    expect(licencia.body.token).toBe(activar.body.licencia);

    const anulacion = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'anulacion',
            timestamp: Date.now(),
            payload: {
              ventaId: ids.ventaLocal,
              usuarioId: ids.usuario,
              motivo: 'Prueba E2E',
            },
          },
        ],
      });
    expect(anulacion.status).toBe(200);
    expect(anulacion.body.results[0].estado).toBe('aplicada');

    const stockAnulado = await withAdmin((client) =>
      client.query<{ stock_actual: string }>(
        `select stock_actual from productos where id = $1`,
        [ids.producto]
      )
    );
    expect(Number(stockAnulado.rows[0].stock_actual)).toBe(20);

    const movimientosAnulacion = await withAdmin((client) =>
      client.query<{ total: number }>(
        `select count(*)::int as total from movimientos_inventario where empresa_id = $1`,
        [empresaId]
      )
    );
    expect(movimientosAnulacion.rows[0].total).toBe(3);

    // El upsert de producto lleva stock absoluto (ya compensado en el cliente)
    // y debe pisar el stock del servidor. Protege el contrato: si el schema
    // pierde el campo `stock`, zod lo descartaría en silencio y este test falla.
    // La versión enviada es la actual del servidor (igualdad ya aplica).
    const versionServidor = await withAdmin((client) =>
      client.query<{ version: number }>(
        `select version from productos where id = $1`,
        [ids.producto]
      )
    );
    const versionActual = Number(versionServidor.rows[0].version);

    const upsertConStock = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'producto_upsert',
            timestamp: Date.now(),
            payload: {
              id: ids.producto,
              categoriaId: ids.categoria,
              nombre: 'Café E2E',
              precio: 10,
              emoji: '☕',
              color: '#0EA5E9',
              orden: 0,
              activo: true,
              stock: 25,
              stockMinimo: 2,
              version: versionActual,
            },
          },
        ],
      });
    expect(upsertConStock.status).toBe(200);
    expect(upsertConStock.body.results[0].estado).toBe('aplicada');
    expect(upsertConStock.body.results[0].resultado.ignorado).toBeUndefined();

    const stockUpsert = await withAdmin((client) =>
      client.query<{ stock_actual: string }>(
        `select stock_actual from productos where id = $1`,
        [ids.producto]
      )
    );
    expect(Number(stockUpsert.rows[0].stock_actual)).toBe(25);
  });

  it('permite crear una cuenta desde el registro público', async () => {
    const registro = await request(app)
      .post('/api/registro')
      .send({
        nombre: `Empresa Registro ${sufijo}`,
        propietario: 'Propietario Registro',
        email: `registro-${sufijo}@test.local`,
        planCodigo: 'basico',
      });

    expect(registro.status).toBe(201);
    empresaRegistroId = registro.body.empresa.id;
    expect(registro.body.empresa.nombre).toBe(`Empresa Registro ${sufijo}`);
    expect(registro.body.licencia.estado).toBe('pendiente');
    expect(registro.body.codigoActivacion).toMatch(
      /^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
    );

    const activar = await request(app).post('/api/activar').send({
      codigo: registro.body.codigoActivacion,
      fingerprint: `fingerprint-registro-${sufijo}`,
      nombre: 'Caja Registro',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(activar.status).toBe(201);
    expect(activar.body.empresa.id).toBe(empresaRegistroId);
  });
});
