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
  let empresaCruzadaId = '';
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
    if (empresaCruzadaId) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaCruzadaId])
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
    expect(decodeLicenseToken(activar.body.licencia).deviceId).toBeNull();

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

    // El pull también entrega el historial de operación: sin turnos ni ventas,
    // un dispositivo nuevo o que cambió de negocio vería la caja vacía.
    const turno = pull.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'turno' && cambio.id === ids.turno
    );
    expect(turno).toBeTruthy();
    expect(turno.data.estado).toBe('cerrado');
    expect(turno.data.ventasCount).toBe(1);
    expect(turno.data.totalEsperado).toBe(20);
    expect(turno.data.diferencia).toBe(0);

    const venta = pull.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'venta' && cambio.data.localId === ids.ventaLocal
    );
    expect(venta).toBeTruthy();
    expect(venta.data.numero).toBe(1);
    expect(venta.data.total).toBe(20);
    expect(venta.data.anulada).toBe(false);
    expect(venta.data.turnoId).toBe(ids.turno);
    expect(venta.data.items).toHaveLength(1);
    expect(venta.data.items[0].nombre).toBe('Café E2E');
    expect(venta.data.items[0].cantidad).toBe(2);
    expect(venta.data.items[0].subtotal).toBe(20);

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
    // La reactivación re-firma la licencia y queda guardada; ese es el
    // token que el dispositivo debe recibir (el de la primera activación
    // deja de ser válido al reemitir).
    expect(licencia.body.token).toBe(reactivar.body.licencia);

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

    // La anulación también viaja en el pull: el historial de otro dispositivo
    // debe mostrar la venta como anulada, no como ingreso vigente.
    const pullAnulada = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(pullAnulada.status).toBe(200);
    const ventaAnulada = pullAnulada.body.cambios.find(
      (cambio: { tipo: string; id: string }) =>
        cambio.tipo === 'venta' && cambio.data.localId === ids.ventaLocal
    );
    expect(ventaAnulada).toBeTruthy();
    expect(ventaAnulada.data.anulada).toBe(true);
    expect(ventaAnulada.data.motivoAnulacion).toBe('Prueba E2E');

    // Paginación sin pérdidas: muchas filas pueden compartir `updated_at`
    // (un seed las inserta con el mismo `now()`). El cursor compuesto
    // `(updated_at, id)` debe entregarlas todas al recorrer las páginas.
    const idsLote = Array.from({ length: 7 }, () => crypto.randomUUID());
    const instanteLote = new Date().toISOString();
    await withAdmin((client) =>
      client.query(
        `insert into productos
           (id, empresa_id, nombre, precio, stock_actual, updated_at)
         select id, $2, 'Lote', 1, 0, $3::timestamptz
         from unnest($1::uuid[]) as id`,
        [idsLote, empresaId, instanteLote]
      )
    );

    const vistos = new Set<string>();
    let cursor: string | undefined;
    let paginas = 0;
    let quedan = true;
    while (quedan && paginas < 50) {
      const pagina = await request(app)
        .get('/api/sync/pull')
        .query({ deviceId, cursor, limit: 3 })
        .set('Authorization', `Bearer ${deviceToken}`);
      expect(pagina.status).toBe(200);
      for (const cambio of pagina.body.cambios) {
        if (cambio.tipo === 'producto') vistos.add(cambio.id);
      }
      quedan = pagina.body.hayMas === true;
      cursor = pagina.body.cursor ?? cursor;
      paginas += 1;
    }
    expect(quedan).toBe(false);
    for (const id of idsLote) {
      expect(vistos.has(id)).toBe(true);
    }

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

  async function entrarComoAdmin(): Promise<string> {
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    return login.body.token as string;
  }

  async function licenciaDeEmpresa(adminToken: string, empresaBuscada: string): Promise<string> {
    const listado = await request(app)
      .get('/api/admin/licencias')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listado.status).toBe(200);
    const licencia = listado.body.licencias.find(
      (fila: { empresa_id: string }) => fila.empresa_id === empresaBuscada
    );
    expect(licencia).toBeDefined();
    return licencia.id as string;
  }

  it('la licencia permite varias instalaciones y el código es reutilizable', async () => {
    const adminToken = await entrarComoAdmin();
    const licenciaId = await licenciaDeEmpresa(adminToken, empresaId);

    const generado = await request(app)
      .post(`/api/admin/licencias/${licenciaId}/codigo`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(generado.status).toBe(201);
    const codigo = generado.body.codigo as string;

    async function activar(fingerprint: string) {
      return request(app).post('/api/activar').send({
        codigo,
        fingerprint,
        nombre: `Caja ${fingerprint}`,
        plataforma: 'android',
        appVersion: '1.0.0',
      });
    }

    // El mismo código sirve para todas las instalaciones mientras esté vigente.
    const respuestas: Array<{ body: { token: string } }> = [];
    for (let n = 2; n <= 6; n += 1) {
      const respuesta = await activar(`fingerprint-d${n}-${sufijo}`);
      expect(respuesta.status).toBe(201);
      respuestas.push(respuesta);
    }

    const tokens = await Promise.all(
      respuestas.map(async (respuesta) => {
        const licencia = await request(app)
          .get('/api/device/licencia')
          .set('Authorization', `Bearer ${respuesta.body.token}`);
        expect(licencia.status).toBe(200);
        return licencia.body.token as string;
      })
    );
    expect(new Set(tokens).size).toBe(1);

    const lista = await request(app)
      .get('/api/device/dispositivos')
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(lista.status).toBe(200);
    const activos = lista.body.dispositivos.filter(
      (d: { estado: string }) => d.estado === 'activo'
    );
    expect(activos.length).toBeGreaterThanOrEqual(6);
    expect(new Set(activos.map((d: { emitidaEn: string | null }) => d.emitidaEn)).size).toBe(1);

    // Desvincular sigue siendo una operación administrativa del negocio.
    const tercero = activos.find((d: { esEste: boolean }) => !d.esEste);
    const sinCodigo = await request(app)
      .post('/api/device/desvincular')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ dispositivoId: tercero.id });
    expect(sinCodigo.status).toBe(403);
    expect(sinCodigo.body.error).toBe('CODIGO_REQUERIDO');

    const conCodigo = await request(app)
      .post('/api/device/desvincular')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ dispositivoId: tercero.id, codigo });
    expect(conCodigo.status).toBe(200);
    expect(conCodigo.body.dispositivo.id).toBe(tercero.id);

    const conCodigoInvalido = await request(app)
      .post('/api/device/desvincular')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ dispositivoId: tercero.id, codigo: 'MICAJA-AAAA-AAAA-AAAA' });
    expect(conCodigoInvalido.status).toBe(403);
    expect(conCodigoInvalido.body.error).toBe('CODIGO_INVALIDO');
  });

  it('invita un trabajador y activa su dispositivo con rol limitado', async () => {
    const invitacion = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ rol: 'dependiente', expiraHoras: 24 });
    expect(invitacion.status).toBe(201);
    expect(invitacion.body.codigo).toMatch(/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const activar = await request(app).post('/api/activar').send({
      codigo: invitacion.body.codigo,
      fingerprint: `fingerprint-inv-${sufijo}`,
      nombre: 'Caja Trabajador',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(activar.status).toBe(201);
    expect(activar.body.via).toBe('invitacion');
    expect(activar.body.rol).toBe('dependiente');

    // La invitación es de un solo uso.
    const reuso = await request(app).post('/api/activar').send({
      codigo: invitacion.body.codigo,
      fingerprint: `fingerprint-inv2-${sufijo}`,
      nombre: 'Caja Trabajador 2',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(reuso.status).toBe(409);
    expect(reuso.body.error).toBe('INVITACION_USADA');

    // El dispositivo del trabajador queda sincronizando con su empresa.
    const pullTrabajador = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: activar.body.dispositivo.id, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${activar.body.token}`);
    expect(pullTrabajador.status).toBe(200);
    expect(pullTrabajador.body.licencia.estado).toBe('activa');
  });

  it('permite activar la misma instalación en otro negocio', async () => {
    const adminToken = await entrarComoAdmin();

    const creada = await request(app)
      .post('/api/admin/empresas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: `Empresa Cruzada ${sufijo}`,
        propietario: 'Otro Dueno',
        planCodigo: 'basico',
      });
    expect(creada.status).toBe(201);
    empresaCruzadaId = creada.body.empresa.id;

    // `fingerprint-<sufijo>` ya está registrada en la empresa principal, pero
    // la huella ya no ata la instalación a un negocio.
    const intento = await request(app).post('/api/activar').send({
      codigo: creada.body.codigoActivacion,
      fingerprint: `fingerprint-${sufijo}`,
      nombre: 'Caja Cruzada',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(intento.status).toBe(201);
    expect(intento.body.empresa.id).toBe(empresaCruzadaId);

    const cruzada = await withAdmin((client) =>
      client.query<{ total: number }>(
        `select count(*)::int as total from dispositivos where empresa_id = $1`,
        [empresaCruzadaId]
      )
    );
    expect(cruzada.rows[0].total).toBe(1);
  });

  it('suspende la licencia y el servidor corta la sincronización', async () => {
    const adminToken = await entrarComoAdmin();
    const licenciaId = await licenciaDeEmpresa(adminToken, empresaId);

    const suspender = await request(app)
      .patch(`/api/admin/licencias/${licenciaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado: 'suspendida' });
    expect(suspender.status).toBe(200);

    const pushSuspendido = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'settings_upsert',
            timestamp: Date.now(),
            payload: { clave: 'moneda', valor: 'CUP', version: 2 },
          },
        ],
      });
    expect(pushSuspendido.status).toBe(403);
    expect(pushSuspendido.body.error).toBe('LICENCIA_SUSPENDIDA');

    const licenciaSuspendida = await request(app)
      .get('/api/device/licencia')
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(licenciaSuspendida.status).toBe(200);
    expect(licenciaSuspendida.body.estado).toBe('suspendida');
    expect(licenciaSuspendida.body.token).toBeNull();

    const reactivar = await request(app)
      .patch(`/api/admin/licencias/${licenciaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado: 'activa' });
    expect(reactivar.status).toBe(200);

    const licenciaReactivada = await request(app)
      .get('/api/device/licencia')
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(licenciaReactivada.status).toBe(200);
    expect(licenciaReactivada.body.estado).toBe('activa');
    // La reactivación re-firma y vuelve a entregar el token.
    expect(licenciaReactivada.body.token).not.toBeNull();

    const pullRecuperado = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${deviceToken}`);
    expect(pullRecuperado.status).toBe(200);
    expect(pullRecuperado.body.licencia.token).toBe(licenciaReactivada.body.token);
  });
});
