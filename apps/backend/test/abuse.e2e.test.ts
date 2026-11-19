import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool, withAdmin } from '../src/db';
import { hashCodigoActivacion } from '../src/services/licencias';

const ejecutar = Boolean(process.env.DATABASE_URL && process.env.LICENSE_PRIVATE_KEY);

/**
 * Pruebas de abuso: intentan romper el servidor con roles, ids y números
 * fuera de lo normal. Cada caso debe terminar en un rechazo claro (sin 500)
 * o en un idempotente seguro, nunca en una escritura cruzada entre negocios.
 */
describe.skipIf(!ejecutar)('endurecimiento: roles, aislamiento y límites', () => {
  const app = createApp();
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const email = `abuso-${sufijo}@test.local`;
  const password = 'ClaveSegura123';
  const nuevoId = () => crypto.randomUUID();

  const ids = {
    ownerUser: nuevoId(),
    depUser: nuevoId(),
    adminUser: nuevoId(),
    catA: nuevoId(),
    prodA: nuevoId(),
    userB: nuevoId(),
    catB: nuevoId(),
    prodB: nuevoId(),
    deviceB: nuevoId(),
    turnoB: nuevoId(),
    ventaB: nuevoId(),
    turnoOwner: nuevoId(),
    turnoDep: nuevoId(),
    movIdem: nuevoId(),
    movIntruso: nuevoId(),
  };

  let adminId = '';
  let adminToken = '';
  let empresaA = '';
  let empresaB = '';
  let owner = { id: '', token: '' };
  let dependiente = { id: '', token: '' };
  let adminInvitado = { id: '', token: '' };

  function op(tipo: string, payload: unknown, operationId = nuevoId()) {
    return { operationId, tipo, timestamp: Date.now(), payload };
  }

  function push(device: { id: string; token: string }, operations: unknown[]) {
    return request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ deviceId: device.id, operations });
  }

  function pull(device: { id: string; token: string }) {
    return request(app)
      .get('/api/sync/pull')
      .query({ deviceId: device.id, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${device.token}`);
  }

  function resultadoDe(
    respuesta: { body: { results: Array<{ operationId: string }> } },
    operationId: string
  ): { estado: string; error?: string; resultado?: Record<string, unknown> } {
    return respuesta.body.results.find(
      (fila) => fila.operationId === operationId
    ) as { estado: string; error?: string; resultado?: Record<string, unknown> };
  }

  async function activar(codigo: string, fingerprint: string, nombre: string) {
    return request(app).post('/api/activar').send({
      codigo,
      fingerprint,
      nombre,
      plataforma: 'android',
      appVersion: '1.0.0',
    });
  }

  async function crearEmpresa(nombre: string, planCodigo: string) {
    const creada = await request(app)
      .post('/api/admin/empresas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: `${nombre} ${sufijo}`, propietario: `Dueno ${nombre}`, planCodigo });
    expect(creada.status, JSON.stringify(creada.body)).toBe(201);
    return creada;
  }

  beforeAll(async () => {
    if (!ejecutar) return;

    const hash = await bcrypt.hash(password, 4);
    const admin = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into admin_usuarios (email, nombre, password_hash, rol)
         values ($1, 'Admin Abuso', $2, 'superadmin')
         returning id`,
        [email, hash]
      )
    );
    adminId = admin.rows[0].id;

    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    adminToken = login.body.token;

    const empresa = await crearEmpresa('Abuso A', 'pro');
    empresaA = empresa.body.empresa.id;
    const activacion = await activar(
      empresa.body.codigoActivacion,
      `fp-owner-${sufijo}`,
      'Caja Dueno'
    );
    expect(activacion.status, JSON.stringify(activacion.body)).toBe(201);
    expect(activacion.body.rol).toBe('propietario');
    owner = { id: activacion.body.dispositivo.id, token: activacion.body.token };

    // Catálogo y cuentas base del negocio A.
    const fixtures = await push(owner, [
      op('usuario_upsert', {
        id: ids.ownerUser,
        nombre: 'Dueno',
        usuario: `dueno${sufijo}`,
        rol: 'propietario',
        activo: true,
        version: 1,
      }),
      op('usuario_upsert', {
        id: ids.depUser,
        nombre: 'Cajero',
        usuario: `cajero${sufijo}`,
        rol: 'dependiente',
        activo: true,
        version: 1,
      }),
      op('categoria_upsert', {
        id: ids.catA,
        nombre: 'Bebidas',
        color: '#0EA5E9',
        orden: 0,
        activo: true,
        version: 1,
      }),
      op('producto_upsert', {
        id: ids.prodA,
        categoriaId: ids.catA,
        nombre: 'Café',
        precio: 10,
        emoji: '☕',
        color: '#0EA5E9',
        orden: 0,
        activo: true,
        stock: 10,
        stockMinimo: 1,
        version: 1,
      }),
      op('settings_upsert', {
        clave: 'nombre_negocio',
        valor: 'Bodega A',
        version: 1,
      }),
    ]);
    expect(fixtures.status).toBe(200);
    for (const fila of fixtures.body.results) {
      expect(fila.estado, fila.error).toBe('aplicada');
    }

    // Dos terminales invitadas: dependiente y administrador.
    const invDep = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ rol: 'dependiente', expiraHoras: 24 });
    expect(invDep.status).toBe(201);
    const actDep = await activar(invDep.body.codigo, `fp-dep-${sufijo}`, 'Caja Cajero');
    expect(actDep.status, JSON.stringify(actDep.body)).toBe(201);
    expect(actDep.body.rol).toBe('dependiente');
    dependiente = { id: actDep.body.dispositivo.id, token: actDep.body.token };

    const invAdmin = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ rol: 'admin', expiraHoras: 24 });
    expect(invAdmin.status).toBe(201);
    const actAdmin = await activar(invAdmin.body.codigo, `fp-admin-${sufijo}`, 'Caja Admin');
    expect(actAdmin.status, JSON.stringify(actAdmin.body)).toBe(201);
    expect(actAdmin.body.rol).toBe('admin');
    adminInvitado = { id: actAdmin.body.dispositivo.id, token: actAdmin.body.token };

    // Negocio B: datos y una venta ya existentes para probar el aislamiento.
    const empresaBR = await crearEmpresa('Abuso B', 'basico');
    empresaB = empresaBR.body.empresa.id;

    const ahora = new Date().toISOString();
    await withAdmin(async (client) => {
      await client.query(
        `insert into usuarios (id, empresa_id, nombre, usuario, rol)
         values ($1, $2, 'Ajeno', $3, 'dependiente')`,
        [ids.userB, empresaB, `ajeno${sufijo}`]
      );
      await client.query(
        `insert into categorias (id, empresa_id, nombre)
         values ($1, $2, 'Ajena')`,
        [ids.catB, empresaB]
      );
      await client.query(
        `insert into productos (id, empresa_id, nombre, precio, stock_actual)
         values ($1, $2, 'Producto ajeno', 5, 3)`,
        [ids.prodB, empresaB]
      );
      await client.query(
        `insert into dispositivos (id, empresa_id, nombre, plataforma, fingerprint)
         values ($1, $2, 'Dispositivo ajeno', 'android', $3)`,
        [ids.deviceB, empresaB, `fp-b-${sufijo}`]
      );
      await client.query(
        `insert into turnos_caja (id, empresa_id, dispositivo_id, usuario_id, apertura)
         values ($1, $2, $3, $4, $5)`,
        [ids.turnoB, empresaB, ids.deviceB, ids.userB, ahora]
      );
      await client.query(
        `insert into ventas
           (id, empresa_id, dispositivo_id, usuario_id, turno_id, local_id, numero,
            fecha_cliente, subtotal, total, forma_pago)
         values ($1, $2, $3, $4, $5, $6, 1, $7, 5, 5, 'efectivo')`,
        [ids.ventaB, empresaB, ids.deviceB, ids.userB, ids.turnoB, nuevoId(), ahora]
      );
      // Clave interna que nunca debe viajar por la nube.
      await client.query(
        `insert into settings (empresa_id, clave, valor, version)
         values ($1, 'licencia_token', '"secreto"'::jsonb, 1)`,
        [empresaA]
      );
    });
  }, 60_000);

  afterAll(async () => {
    if (!ejecutar) return;

    for (const empresa of [empresaA, empresaB]) {
      if (!empresa) continue;
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresa]).catch(() => undefined)
      );
    }
    if (adminId) {
      await withAdmin((client) =>
        client.query(`delete from admin_usuarios where id = $1`, [adminId])
      );
    }
    await pool.end();
  });

  it('deja sincronizar a un dependiente pero le niega la administración', async () => {
    // Un dependiente sincroniza ventas y settings, pero no gestiona terminales,
    // invitaciones ni cuentas de otros roles.
    const lectura = await pull(dependiente);
    expect(lectura.status).toBe(200);
    expect(lectura.body.licencia.estado).toBe('activa');

    const movimiento = await push(dependiente, [
      op('movimiento_inventario', {
        movimientoId: nuevoId(),
        productoId: ids.prodA,
        tipo: 'entrada',
        cantidad: 5,
      }),
    ]);
    expect(movimiento.status).toBe(200);
    expect(movimiento.body.results[0].estado, movimiento.body.results[0].error).toBe(
      'aplicada'
    );

    const lista = await request(app)
      .get('/api/device/dispositivos')
      .set('Authorization', `Bearer ${dependiente.token}`);
    expect(lista.status).toBe(403);
    expect(lista.body.error).toBe('ROL_INSUFICIENTE');

    const invitar = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${dependiente.token}`)
      .send({ rol: 'dependiente', expiraHoras: 1 });
    expect(invitar.status).toBe(403);
    expect(invitar.body.error).toBe('ROL_INSUFICIENTE');

    const desvincular = await request(app)
      .post('/api/device/desvincular')
      .set('Authorization', `Bearer ${dependiente.token}`)
      .send({ dispositivoId: owner.id, codigo: 'MICAJA-AAAA-AAAA-AAAA' });
    expect(desvincular.status).toBe(403);
    expect(desvincular.body.error).toBe('ROL_INSUFICIENTE');

    const opSettings = op('settings_upsert', {
      clave: 'nombre_negocio',
      valor: 'Cambiado por dependiente',
      version: 2,
    });
    const opEscalar = op('usuario_upsert', {
      id: ids.adminUser,
      nombre: 'Admin falso',
      usuario: `falso${sufijo}`,
      rol: 'admin',
      activo: true,
      version: 1,
    });
    const opDueno = op('usuario_upsert', {
      id: ids.ownerUser,
      nombre: 'Dueno',
      usuario: `dueno${sufijo}`,
      rol: 'dependiente',
      activo: true,
      version: 2,
    });
    const abuso = await push(dependiente, [opSettings, opEscalar, opDueno]);
    expect(abuso.status).toBe(200);
    expect(resultadoDe(abuso, opSettings.operationId).estado).toBe('aplicada');
    expect(resultadoDe(abuso, opEscalar.operationId).estado).toBe('rechazada');
    expect(resultadoDe(abuso, opEscalar.operationId).error).toContain('ROL_INSUFICIENTE');
    expect(resultadoDe(abuso, opDueno.operationId).estado).toBe('rechazada');
    expect(resultadoDe(abuso, opDueno.operationId).error).toContain('USUARIO_PROTEGIDO');

    const ajuste = await withAdmin((client) =>
      client.query<{ valor: string }>(
        `select valor from settings where empresa_id = $1 and clave = 'nombre_negocio'`,
        [empresaA]
      )
    );
    expect(ajuste.rows[0]?.valor).toBe('Cambiado por dependiente');

    const usuarioEscalado = await withAdmin((client) =>
      client.query<{ rol: string }>(`select rol::text as rol from usuarios where id = $1`, [
        ids.adminUser,
      ])
    );
    expect(usuarioEscalado.rowCount).toBe(0);
  });

  it('un administrador invitado gestiona terminales y la configuración, pero no escala roles', async () => {
    const lista = await request(app)
      .get('/api/device/dispositivos')
      .set('Authorization', `Bearer ${adminInvitado.token}`);
    expect(lista.status).toBe(200);
    const roles = lista.body.dispositivos.map(
      (fila: { id: string; rol: string }) => `${fila.id}:${fila.rol}`
    );
    expect(roles).toContain(`${owner.id}:propietario`);
    expect(roles).toContain(`${dependiente.id}:dependiente`);
    expect(roles).toContain(`${adminInvitado.id}:admin`);

    const invitar = await request(app)
      .post('/api/device/invitaciones')
      .set('Authorization', `Bearer ${adminInvitado.token}`)
      .send({ rol: 'dependiente', expiraHoras: 1 });
    expect(invitar.status).toBe(201);

    const opSettings = op('settings_upsert', {
      clave: 'moneda',
      valor: 'USD',
      version: 2,
    });
    const opEscalar = op('usuario_upsert', {
      id: nuevoId(),
      nombre: 'Otro dueno',
      usuario: `otrodueno${sufijo}`,
      rol: 'propietario',
      activo: true,
      version: 1,
    });
    const opDueno = op('usuario_upsert', {
      id: ids.ownerUser,
      nombre: 'Dueno',
      usuario: `dueno${sufijo}`,
      rol: 'admin',
      activo: true,
      version: 3,
    });
    const opAdminLegitimo = op('usuario_upsert', {
      id: nuevoId(),
      nombre: 'Segundo admin',
      usuario: `admin2${sufijo}`,
      rol: 'admin',
      activo: true,
      version: 1,
    });

    const abuso = await push(adminInvitado, [
      opSettings,
      opEscalar,
      opDueno,
      opAdminLegitimo,
    ]);
    expect(abuso.status).toBe(200);
    expect(resultadoDe(abuso, opSettings.operationId).estado).toBe('aplicada');
    expect(resultadoDe(abuso, opEscalar.operationId).estado).toBe('rechazada');
    expect(resultadoDe(abuso, opEscalar.operationId).error).toContain('ROL_INSUFICIENTE');
    expect(resultadoDe(abuso, opDueno.operationId).estado).toBe('rechazada');
    expect(resultadoDe(abuso, opDueno.operationId).error).toContain('USUARIO_PROTEGIDO');
    expect(resultadoDe(abuso, opAdminLegitimo.operationId).estado).toBe('aplicada');
  });

  it('el propietario cambia ajustes y solo claves de negocio', async () => {
    const permitido = op('settings_upsert', {
      clave: 'simbolo_moneda',
      valor: '$',
      version: 1,
    });
    const interno = op('settings_upsert', {
      clave: 'licencia_token',
      valor: 'falso',
      version: 1,
    });
    const respuesta = await push(owner, [permitido, interno]);
    expect(respuesta.status).toBe(200);
    expect(resultadoDe(respuesta, permitido.operationId).estado).toBe('aplicada');
    expect(resultadoDe(respuesta, interno.operationId).estado).toBe('rechazada');
    expect(resultadoDe(respuesta, interno.operationId).error).toContain(
      'SETTING_NO_SINCRONIZABLE'
    );

    // La clave interna insertada a mano tampoco debe salir en el pull.
    const lectura = await pull(owner);
    expect(lectura.status).toBe(200);
    const claves = lectura.body.cambios
      .filter((cambio: { tipo: string }) => cambio.tipo === 'setting')
      .map((cambio: { id: string }) => cambio.id);
    expect(claves).toContain('nombre_negocio');
    expect(claves).not.toContain('licencia_token');
  });

  it('rechaza referencias de usuarios, productos y ventas de otro negocio', async () => {
    const ahora = new Date().toISOString();
    const opUsuarioAjeno = op('venta', {
      localId: nuevoId(),
      usuarioId: ids.userB,
      fechaCliente: ahora,
      subtotal: 10,
      descuentoPct: 0,
      total: 10,
      formaPago: 'efectivo',
      montoEfectivo: 10,
      montoDigital: 0,
      items: [
        {
          productoId: ids.prodA,
          nombre: 'Café',
          precioUnitario: 10,
          cantidad: 1,
          subtotal: 10,
        },
      ],
    });
    const opProductoAjeno = op('venta', {
      localId: nuevoId(),
      usuarioId: ids.depUser,
      fechaCliente: ahora,
      subtotal: 5,
      descuentoPct: 0,
      total: 5,
      formaPago: 'efectivo',
      montoEfectivo: 5,
      montoDigital: 0,
      items: [
        {
          productoId: ids.prodB,
          nombre: 'Producto ajeno',
          precioUnitario: 5,
          cantidad: 1,
          subtotal: 5,
        },
      ],
    });
    const opCategoriaAjena = op('producto_upsert', {
      id: nuevoId(),
      categoriaId: ids.catB,
      nombre: 'Intruso',
      precio: 1,
      version: 1,
    });
    const opMovimientoAjeno = op('movimiento_inventario', {
      movimientoId: nuevoId(),
      productoId: ids.prodB,
      tipo: 'entrada',
      cantidad: 1,
    });
    const opTurnoUsuarioAjeno = op('turno_apertura', {
      turnoId: nuevoId(),
      usuarioId: ids.userB,
      apertura: ahora,
      fondoInicial: 0,
      desglose: {},
    });
    const opAnularVentaAjena = op('anulacion', {
      ventaId: ids.ventaB,
      usuarioId: ids.depUser,
      motivo: 'intento',
    });

    const respuesta = await push(owner, [
      opUsuarioAjeno,
      opProductoAjeno,
      opCategoriaAjena,
      opMovimientoAjeno,
      opTurnoUsuarioAjeno,
      opAnularVentaAjena,
    ]);
    expect(respuesta.status).toBe(200);

    expect(resultadoDe(respuesta, opUsuarioAjeno.operationId).error).toContain(
      'USUARIO_INVALIDO'
    );
    expect(resultadoDe(respuesta, opProductoAjeno.operationId).error).toContain(
      'PRODUCTO_INVALIDO'
    );
    expect(resultadoDe(respuesta, opCategoriaAjena.operationId).error).toContain(
      'CATEGORIA_INVALIDA'
    );
    expect(resultadoDe(respuesta, opMovimientoAjeno.operationId).error).toContain(
      'PRODUCTO_INVALIDO'
    );
    expect(resultadoDe(respuesta, opTurnoUsuarioAjeno.operationId).error).toContain(
      'USUARIO_INVALIDO'
    );
    expect(resultadoDe(respuesta, opAnularVentaAjena.operationId).error).toContain(
      'VENTA_NO_ENCONTRADA'
    );

    const datos = await withAdmin(async (client) => {
      const ventas = await client.query<{ total: number }>(
        `select count(*)::int as total from ventas where empresa_id = $1`,
        [empresaA]
      );
      const turnos = await client.query<{ total: number }>(
        `select count(*)::int as total from turnos_caja where empresa_id = $1`,
        [empresaA]
      );
      const productos = await client.query<{ total: number }>(
        `select count(*)::int as total from productos where empresa_id = $1`,
        [empresaA]
      );
      return {
        ventas: ventas.rows[0].total,
        turnos: turnos.rows[0].total,
        productos: productos.rows[0].total,
      };
    });
    expect(datos.ventas).toBe(0);
    expect(datos.turnos).toBe(0);
    expect(datos.productos).toBe(1);
  });

  it('aísla los ids de turno y exige cerrar desde el mismo dispositivo', async () => {
    // Se reutiliza el id del turno de B para forzar la colisión entre negocios.
    const apertura = op('turno_apertura', {
      turnoId: ids.turnoB,
      usuarioId: ids.depUser,
      apertura: new Date().toISOString(),
      fondoInicial: 0,
      desglose: {},
    });
    const abierto = await push(dependiente, [apertura]);
    expect(abierto.status).toBe(200);
    expect(resultadoDe(abierto, apertura.operationId).estado, JSON.stringify(abierto.body)).toBe(
      'aplicada'
    );

    const cierreAjeno = op('turno_cierre', {
      turnoId: ids.turnoB,
      cierre: new Date().toISOString(),
      ventasCount: 0,
      totalEsperado: 0,
      desglose: {},
      dineroReal: 0,
      diferencia: 0,
    });
    const cierreRechazado = await push(owner, [cierreAjeno]);
    expect(resultadoDe(cierreRechazado, cierreAjeno.operationId).estado).toBe('rechazada');
    expect(resultadoDe(cierreRechazado, cierreAjeno.operationId).error).toContain(
      'TURNO_OTRO_DISPOSITIVO'
    );

    const cierre = op('turno_cierre', {
      turnoId: ids.turnoB,
      cierre: new Date().toISOString(),
      ventasCount: 0,
      totalEsperado: 0,
      desglose: {},
      dineroReal: 0,
      diferencia: 0,
    });
    const cerrado = await push(dependiente, [cierre]);
    expect(resultadoDe(cerrado, cierre.operationId).estado).toBe('aplicada');

    const repetido = await push(dependiente, [cierre]);
    expect(resultadoDe(repetido, cierre.operationId).estado).toBe('aplicada');

    const cierreNuevo = op('turno_cierre', {
      turnoId: ids.turnoB,
      cierre: new Date().toISOString(),
      ventasCount: 0,
      totalEsperado: 0,
      desglose: {},
      dineroReal: 0,
      diferencia: 0,
    });
    const segundaVez = await push(dependiente, [cierreNuevo]);
    expect(resultadoDe(segundaVez, cierreNuevo.operationId).estado).toBe('aplicada');
    expect(resultadoDe(segundaVez, cierreNuevo.operationId).resultado?.idempotente).toBe(true);

    const enB = await withAdmin((client) =>
      client.query<{ estado: string; empresa_id: string }>(
        `select estado::text as estado, empresa_id from turnos_caja where id = $1`,
        [ids.turnoB]
      )
    );
    expect(enB.rowCount).toBe(2);
    const deB = enB.rows.find((fila) => fila.empresa_id === empresaB);
    expect(deB?.estado).toBe('abierto');
  });

  it('no permite meter ventas en el turno de otra terminal', async () => {
    const apertura = op('turno_apertura', {
      turnoId: ids.turnoOwner,
      usuarioId: ids.ownerUser,
      apertura: new Date().toISOString(),
      fondoInicial: 20,
      desglose: { efectivo: 20 },
    });
    const abierto = await push(owner, [apertura]);
    expect(resultadoDe(abierto, apertura.operationId).estado, JSON.stringify(abierto.body)).toBe(
      'aplicada'
    );

    const ventaIntrusa = op('venta', {
      localId: nuevoId(),
      usuarioId: ids.depUser,
      turnoId: ids.turnoOwner,
      fechaCliente: new Date().toISOString(),
      subtotal: 10,
      descuentoPct: 0,
      total: 10,
      formaPago: 'efectivo',
      montoEfectivo: 10,
      montoDigital: 0,
      items: [
        {
          productoId: ids.prodA,
          nombre: 'Café',
          precioUnitario: 10,
          cantidad: 1,
          subtotal: 10,
        },
      ],
    });
    const rechazada = await push(dependiente, [ventaIntrusa]);
    expect(resultadoDe(rechazada, ventaIntrusa.operationId).estado).toBe('rechazada');
    expect(resultadoDe(rechazada, ventaIntrusa.operationId).error).toContain(
      'TURNO_OTRO_DISPOSITIVO'
    );

    const cierre = op('turno_cierre', {
      turnoId: ids.turnoOwner,
      cierre: new Date().toISOString(),
      ventasCount: 0,
      totalEsperado: 20,
      desglose: { efectivo: 20 },
      dineroReal: 20,
      diferencia: 0,
    });
    const cerrado = await push(owner, [cierre]);
    expect(resultadoDe(cerrado, cierre.operationId).estado).toBe('aplicada');
  });

  it('rechaza montos, cantidades y versiones fuera de rango sin romper el push', async () => {
    const ahora = new Date().toISOString();
    const opPrecio = op('producto_upsert', {
      id: nuevoId(),
      nombre: 'Precio absurdo',
      precio: 1e13,
      version: 1,
    });
    const opCantidad = op('movimiento_inventario', {
      movimientoId: nuevoId(),
      productoId: ids.prodA,
      tipo: 'entrada',
      cantidad: 1e7,
    });
    const opVenta = op('venta', {
      localId: nuevoId(),
      usuarioId: ids.depUser,
      fechaCliente: ahora,
      subtotal: 1e7,
      descuentoPct: 0,
      total: 1e7,
      formaPago: 'efectivo',
      montoEfectivo: 1e7,
      montoDigital: 0,
      items: [
        {
          productoId: ids.prodA,
          nombre: 'Café',
          precioUnitario: 10,
          cantidad: 1e7,
          subtotal: 1e8,
        },
      ],
    });
    const opVersion = op('settings_upsert', {
      clave: 'moneda',
      valor: 'CUP',
      version: 0,
    });
    const opInfinito = op('movimiento_inventario', {
      movimientoId: nuevoId(),
      productoId: ids.prodA,
      tipo: 'entrada',
      cantidad: 1e400,
    });

    const respuesta = await push(owner, [opPrecio, opCantidad, opVenta, opVersion, opInfinito]);
    expect(respuesta.status).toBe(200);
    for (const operacion of [opPrecio, opCantidad, opVenta, opVersion, opInfinito]) {
      expect(resultadoDe(respuesta, operacion.operationId).estado).toBe('rechazada');
    }

    const stock = await withAdmin((client) =>
      client.query<{ stock_actual: string }>(
        `select stock_actual from productos where id = $1`,
        [ids.prodA]
      )
    );
    expect(Number(stock.rows[0].stock_actual)).toBe(15);
  });

  it('ata un operation_id a la terminal que lo creó', async () => {
    const operacionId = ids.movIdem;
    const propia = op(
      'movimiento_inventario',
      {
        movimientoId: ids.movIdem,
        productoId: ids.prodA,
        tipo: 'entrada',
        cantidad: 1,
      },
      operacionId
    );
    const aplicada = await push(owner, [propia]);
    expect(resultadoDe(aplicada, operacionId).estado, JSON.stringify(aplicada.body)).toBe(
      'aplicada'
    );

    const intrusa = op(
      'movimiento_inventario',
      {
        movimientoId: ids.movIntruso,
        productoId: ids.prodA,
        tipo: 'entrada',
        cantidad: 100,
      },
      operacionId
    );
    const rechazada = await push(dependiente, [intrusa]);
    expect(rechazada.status).toBe(200);
    expect(resultadoDe(rechazada, operacionId).estado).toBe('rechazada');
    expect(resultadoDe(rechazada, operacionId).error).toBe('OPERACION_DE_OTRO_DISPOSITIVO');

    const stock = await withAdmin((client) =>
      client.query<{ stock_actual: string }>(
        `select stock_actual from productos where id = $1`,
        [ids.prodA]
      )
    );
    expect(Number(stock.rows[0].stock_actual)).toBe(16);
  });

  it('rechaza un deviceId falsificado y un token de terminal en rutas de admin', async () => {
    const operacion = op('settings_upsert', {
      clave: 'moneda',
      valor: 'CUP',
      version: 5,
    });
    const falsificado = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${dependiente.token}`)
      .send({ deviceId: owner.id, operations: [operacion] });
    expect(falsificado.status).toBe(403);
    expect(falsificado.body.error).toBe('DISPOSITIVO_NO_COINCIDE');

    const pullFalso = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: owner.id, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${dependiente.token}`);
    expect(pullFalso.status).toBe(403);
    expect(pullFalso.body.error).toBe('DISPOSITIVO_NO_COINCIDE');

    const adminConTokenDeCaja = await request(app)
      .get('/api/admin/empresas')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(adminConTokenDeCaja.status).toBe(401);
    expect(adminConTokenDeCaja.body.error).toBe('TOKEN_INVALIDO');
  });

  it('no activa con una invitación expirada', async () => {
    const codigo = 'MICAJA-EXPI-RADA-0001';
    await withAdmin((client) =>
      client.query(
        `insert into invitaciones (empresa_id, rol, codigo_hash, expira_en)
         values ($1, 'dependiente', $2, now() - interval '1 hour')`,
        [empresaA, hashCodigoActivacion(codigo)]
      )
    );

    const intento = await activar(codigo, `fp-expirada-${sufijo}`, 'Caja Expirada');
    expect(intento.status).toBe(410);
    expect(intento.body.error).toBe('INVITACION_EXPIRADA');
  });

  it('al autodesvincularse el dispositivo deja de sincronizar', async () => {
    const salida = await request(app)
      .post('/api/device/desvincular')
      .set('Authorization', `Bearer ${dependiente.token}`)
      .send({});
    expect(salida.status).toBe(200);
    expect(salida.body.dispositivo.id).toBe(dependiente.id);

    const lectura = await pull(dependiente);
    expect(lectura.status).toBe(403);
    expect(lectura.body.error).toBe('DISPOSITIVO_INACTIVO');

    const escritura = await push(dependiente, [
      op('movimiento_inventario', {
        movimientoId: nuevoId(),
        productoId: ids.prodA,
        tipo: 'entrada',
        cantidad: 1,
      }),
    ]);
    expect(escritura.status).toBe(403);
    expect(escritura.body.error).toBe('DISPOSITIVO_INACTIVO');
  });
});
