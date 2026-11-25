import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool, withAdmin } from '../src/db';
import { generarCodigoActivacion, hashCodigoActivacion } from '../src/services/licencias';

function sha256(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  let hash = sha256(`${salt}:${pin}`);
  for (let i = 0; i < 1000; i += 1) {
    hash = sha256(`${salt}${hash}`);
  }
  return `sha256it$1000$${salt}$${hash}`;
}

const ejecutar = Boolean(process.env.DATABASE_URL && process.env.LICENSE_PRIVATE_KEY);

describe.skipIf(!ejecutar)('login global por usuario y PIN', () => {
  const app = createApp();
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toLowerCase();
  const pin = '1234';
  const pinHash = hashPin(pin);

  const ids = {
    ownerBasico: crypto.randomUUID(),
    adminBasico: crypto.randomUUID(),
    dependienteBasico: crypto.randomUUID(),
    inactivoBasico: crypto.randomUUID(),
    ownerPro: crypto.randomUUID(),
    dependientePro: crypto.randomUUID(),
    ownerVencido: crypto.randomUUID(),
    productoVencido: crypto.randomUUID(),
  };

  let empresaBasicoId = '';
  let empresaProId = '';
  let empresaVencidoId = '';
  let dispositivoOwnerBasicoId = '';
  let dispositivoOwnerProId = '';
  let dispositivoDependienteProId = '';

  const usuarioBasico = `owner-b${sufijo}`;
  const usuarioAdmin = `admin-b${sufijo}`;
  const usuarioDependiente = `dep-b${sufijo}`;
  const usuarioInactivo = `inactivo-b${sufijo}`;
  const usuarioPro = `owner-p${sufijo}`;
  const usuarioDependientePro = `dep-p${sufijo}`;
  const usuarioVencido = `owner-v${sufijo}`;

  beforeAll(async () => {
    if (!ejecutar) return;

    const planes = await withAdmin((client) =>
      client.query<{ id: string; codigo: string; max_dispositivos: number | null }>(
        `select id, codigo, max_dispositivos from planes where codigo in ('basico', 'pro')`
      )
    );
    const planBasico = planes.rows.find((fila) => fila.codigo === 'basico')!;
    const planPro = planes.rows.find((fila) => fila.codigo === 'pro')!;

    const empresaBasico = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into empresas (nombre, propietario, estado, plan_id)
         values ($1, 'Propietario Básico', 'activa', $2)
         returning id`,
        [`Empresa Básico ${sufijo}`, planBasico.id]
      )
    );
    empresaBasicoId = empresaBasico.rows[0].id;

    const empresaPro = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into empresas (nombre, propietario, estado, plan_id)
         values ($1, 'Propietario Pro', 'activa', $2)
         returning id`,
        [`Empresa Pro ${sufijo}`, planPro.id]
      )
    );
    empresaProId = empresaPro.rows[0].id;

    const empresaVencido = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into empresas (nombre, propietario, estado, plan_id)
         values ($1, 'Propietario Vencido', 'activa', $2)
         returning id`,
        [`Empresa Vencida ${sufijo}`, planBasico.id]
      )
    );
    empresaVencidoId = empresaVencido.rows[0].id;

    const venceEn = new Date(Date.now() + 30 * 86_400_000);
    for (const [empresaId, planId] of [
      [empresaBasicoId, planBasico.id],
      [empresaProId, planPro.id],
    ]) {
      await withAdmin((client) =>
        client.query(
          `insert into licencias
             (empresa_id, plan_id, estado, vence_en, grace_dias, features)
           values ($1, $2, 'activa', $3, 0, '["ventas"]'::jsonb)`,
          [empresaId, planId, venceEn]
        )
      );
    }

    await withAdmin((client) =>
      client.query(
        `insert into licencias
           (empresa_id, plan_id, estado, vence_en, grace_dias, features)
         values ($1, $2, 'vencida', $3, 0, '["ventas"]'::jsonb)`,
        [empresaVencidoId, planBasico.id, new Date(Date.now() - 86_400_000)]
      )
    );
    await withAdmin((client) =>
      client.query(
        `insert into productos (id, empresa_id, nombre, precio, stock_actual)
         values ($1, $2, 'Producto vencido', 5, 3)`,
        [ids.productoVencido, empresaVencidoId]
      )
    );

    const usuarios: Array<{
      id: string;
      empresaId: string;
      nombre: string;
      usuario: string;
      rol: 'propietario' | 'admin' | 'dependiente';
      activo: boolean;
    }> = [
      {
        id: ids.ownerBasico,
        empresaId: empresaBasicoId,
        nombre: 'Owner Básico',
        usuario: usuarioBasico,
        rol: 'propietario',
        activo: true,
      },
      {
        id: ids.adminBasico,
        empresaId: empresaBasicoId,
        nombre: 'Admin Básico',
        usuario: usuarioAdmin,
        rol: 'admin',
        activo: true,
      },
      {
        id: ids.dependienteBasico,
        empresaId: empresaBasicoId,
        nombre: 'Dependiente Básico',
        usuario: usuarioDependiente,
        rol: 'dependiente',
        activo: true,
      },
      {
        id: ids.inactivoBasico,
        empresaId: empresaBasicoId,
        nombre: 'Inactivo Básico',
        usuario: usuarioInactivo,
        rol: 'dependiente',
        activo: false,
      },
      {
        id: ids.ownerPro,
        empresaId: empresaProId,
        nombre: 'Owner Pro',
        usuario: usuarioPro,
        rol: 'propietario',
        activo: true,
      },
      {
        id: ids.dependientePro,
        empresaId: empresaProId,
        nombre: 'Dependiente Pro',
        usuario: usuarioDependientePro,
        rol: 'dependiente',
        activo: true,
      },
      {
        id: ids.ownerVencido,
        empresaId: empresaVencidoId,
        nombre: 'Owner Vencido',
        usuario: usuarioVencido,
        rol: 'propietario',
        activo: true,
      },
    ];

    for (const usuario of usuarios) {
      await withAdmin((client) =>
        client.query(
          `insert into usuarios
             (id, empresa_id, nombre, usuario, rol, activo, password_hash, version)
           values ($1, $2, $3, $4, $5::usuario_rol, $6, $7, 1)`,
          [
            usuario.id,
            usuario.empresaId,
            usuario.nombre,
            usuario.usuario,
            usuario.rol,
            usuario.activo,
            pinHash,
          ]
        )
      );
    }

    const ownerBasico = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into dispositivos
           (empresa_id, nombre, plataforma, fingerprint, estado, rol, last_seen_at)
         values ($1, 'Caja Básico', 'web', $2, 'activo', 'propietario', now())
         returning id`,
        [empresaBasicoId, `owner-basico-${sufijo}`]
      )
    );
    dispositivoOwnerBasicoId = ownerBasico.rows[0].id;

    const ownerPro = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into dispositivos
           (empresa_id, nombre, plataforma, fingerprint, estado, rol, last_seen_at)
         values ($1, 'Caja Pro', 'android', $2, 'activo', 'propietario', now())
         returning id`,
        [empresaProId, `owner-pro-${sufijo}`]
      )
    );
    dispositivoOwnerProId = ownerPro.rows[0].id;

    const dependientePro = await withAdmin((client) =>
      client.query<{ id: string }>(
        `insert into dispositivos
           (empresa_id, nombre, plataforma, fingerprint, estado, rol, last_seen_at)
         values ($1, 'Mostrador Pro', 'android', $2, 'activo', 'dependiente', now())
         returning id`,
        [empresaProId, `dep-pro-${sufijo}`]
      )
    );
    dispositivoDependienteProId = dependientePro.rows[0].id;
  });

  afterAll(async () => {
    if (!ejecutar) return;

    for (const empresaId of [empresaBasicoId, empresaProId, empresaVencidoId].filter(Boolean)) {
      await withAdmin((client) =>
        client.query(`delete from empresas where id = $1`, [empresaId])
      );
    }
    await pool.end();
  });

  function login(usuario: string, fingerprint: string) {
    return request(app).post('/api/auth/usuario').send({
      usuario,
      pin,
      fingerprint,
      nombre: 'Navegador de prueba',
      plataforma: 'web',
      appVersion: '1.0.0',
    });
  }

  it('rechaza credenciales incorrectas y usuarios inexistentes con el mismo error', async () => {
    const incorrecta = await request(app).post('/api/auth/usuario').send({
      usuario: usuarioBasico,
      pin: '9999',
      fingerprint: `login-malo-${sufijo}`,
      nombre: 'Navegador',
      plataforma: 'web',
    });
    expect(incorrecta.status).toBe(401);
    expect(incorrecta.body.error).toBe('CREDENCIALES_INVALIDAS');

    const inexistente = await login(`nadie-${sufijo}`, `login-nadie-${sufijo}`);
    expect(inexistente.status).toBe(401);
    expect(inexistente.body.error).toBe('CREDENCIALES_INVALIDAS');
  });

  it('rechaza una cuenta inactiva', async () => {
    const respuesta = await login(usuarioInactivo, `login-inactivo-${sufijo}`);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('USUARIO_INACTIVO');
  });

  it('entra con la licencia vencida y consulta sus datos sin poder escribir', async () => {
    const respuesta = await login(usuarioVencido, `login-vencido-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.token).toBeTruthy();
    expect(respuesta.body.licencia).toBeNull();
    expect(respuesta.body.estadoLicencia).toBe('vencida');
    expect(respuesta.body.usuario.id).toBe(ids.ownerVencido);

    const consulta = await request(app)
      .get('/api/sync/pull-consulta')
      .query({ deviceId: respuesta.body.dispositivo.id })
      .set('Authorization', `Bearer ${respuesta.body.token}`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.soloLectura).toBe(true);
    expect(consulta.body.licencia.token).toBeNull();
    expect(
      consulta.body.cambios.some(
        (cambio: { tipo: string; id: string }) =>
          cambio.tipo === 'producto' && cambio.id === ids.productoVencido
      )
    ).toBe(true);

    const normal = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: respuesta.body.dispositivo.id })
      .set('Authorization', `Bearer ${respuesta.body.token}`);
    expect(normal.status).toBe(403);
    expect(normal.body.error).toBe('LICENCIA_VENCIDA');

    const escritura = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${respuesta.body.token}`)
      .send({
        deviceId: respuesta.body.dispositivo.id,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'producto',
            timestamp: Date.now(),
            payload: { nombre: 'No debería entrar' },
          },
        ],
      });
    expect(escritura.status).toBe(403);
    expect(escritura.body.error).toBe('LICENCIA_VENCIDA');
  });

  it('renueva con un código nuevo y recupera la sincronización normal', async () => {
    const codigo = generarCodigoActivacion();
    const venceEn = new Date(Date.now() + 30 * 86_400_000);
    await withAdmin((client) =>
      client.query(
        `update licencias set
           vence_en = $2,
           codigo_activacion_hash = $3,
           codigo_expira_en = $4,
           codigo_usado_en = null
         where empresa_id = $1`,
        [
          empresaVencidoId,
          venceEn,
          hashCodigoActivacion(codigo),
          new Date(Date.now() + 7 * 86_400_000),
        ]
      )
    );

    const renovacion = await request(app).post('/api/activar').send({
      codigo,
      fingerprint: `renovacion-${sufijo}`,
      nombre: 'Caja renovada',
      plataforma: 'web',
      appVersion: '1.0.0',
    });
    expect(renovacion.status).toBe(201);
    expect(renovacion.body.licencia).toBeTruthy();

    const sincronizar = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: renovacion.body.dispositivo.id })
      .set('Authorization', `Bearer ${renovacion.body.token}`);
    expect(sincronizar.status).toBe(200);
    expect(sincronizar.body.licencia.token).toBeTruthy();
  });

  it('entra con una instalación nueva aunque el plan esté completo', async () => {
    const respuesta = await login(usuarioBasico, `login-basico-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.via).toBe('login');
    expect(respuesta.body.rol).toBe('propietario');
    expect(respuesta.body.usuario.id).toBe(ids.ownerBasico);
    expect(respuesta.body.dispositivo.id).not.toBe(dispositivoOwnerBasicoId);
  });

  it('un administrador entra con su propia instalación', async () => {
    const respuesta = await login(usuarioAdmin, `login-admin-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('admin');
  });

  it('el propietario recibe la licencia del negocio en su nueva instalación', async () => {
    const respuesta = await login(usuarioBasico, `login-basico-2-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.licencia).toBeTruthy();
    expect(JSON.stringify(respuesta.body)).not.toContain(pinHash);

    const anterior = await withAdmin((client) =>
      client.query<{ estado: string }>(
        `select estado from dispositivos where id = $1`,
        [dispositivoOwnerBasicoId]
      )
    );
    expect(anterior.rows[0].estado).toBe('activo');
  });

  it('un dependiente entra con una instalación nueva sin invitación', async () => {
    const respuesta = await login(usuarioDependiente, `login-dep-nuevo-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('dependiente');
  });

  it('un dependiente con dispositivo existente entra y el pull no filtra el hash', async () => {
    const respuesta = await login(usuarioDependientePro, `dep-pro-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('dependiente');
    expect(respuesta.body.dispositivo.id).toBe(dispositivoDependienteProId);
    expect(respuesta.body.usuario.rol).toBe('dependiente');

    const pull = await request(app)
      .get('/api/sync/pull')
      .query({ deviceId: respuesta.body.dispositivo.id, since: new Date(0).toISOString() })
      .set('Authorization', `Bearer ${respuesta.body.token}`);
    expect(pull.status).toBe(200);

    const usuariosPull = pull.body.cambios.filter(
      (cambio: { tipo: string }) => cambio.tipo === 'usuario'
    );
    expect(usuariosPull.length).toBeGreaterThan(0);
    expect(JSON.stringify(usuariosPull)).not.toContain(pinHash);
    expect(JSON.stringify(usuariosPull)).not.toContain('pinHash');
    expect(JSON.stringify(usuariosPull)).not.toContain('password_hash');
  });

  it('el propietario ocupa una plaza libre sin reemplazar', async () => {
    const respuesta = await login(usuarioPro, `owner-pro-login-${sufijo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('propietario');
    expect(respuesta.body.dispositivo.id).not.toBe(dispositivoOwnerProId);
  });

  it('rechaza un usuario duplicado en otra empresa sin abortar el push', async () => {
    const loginOwner = await login(usuarioPro, `owner-pro-${sufijo}`);
    expect(loginOwner.status).toBe(200);

    const push = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${loginOwner.body.token}`)
      .send({
        deviceId: loginOwner.body.dispositivo.id,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'usuario_upsert',
            timestamp: Date.now(),
            payload: {
              id: crypto.randomUUID(),
              nombre: 'Duplicado',
              usuario: usuarioAdmin,
              rol: 'dependiente',
              activo: true,
              version: 1,
            },
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.results[0].estado).toBe('rechazada');
    expect(push.body.results[0].error).toContain('USUARIO_DUPLICADO');
  });

  it('un usuario creado por sync con pinHash puede autenticarse', async () => {
    const usuarioNuevo = `nuevo-p${sufijo}`;
    const nuevoId = crypto.randomUUID();
    const nuevoPinHash = hashPin('5678');

    const loginOwner = await login(usuarioPro, `owner-pro-${sufijo}`);
    expect(loginOwner.status).toBe(200);

    const push = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${loginOwner.body.token}`)
      .send({
        deviceId: loginOwner.body.dispositivo.id,
        operations: [
          {
            operationId: crypto.randomUUID(),
            tipo: 'usuario_upsert',
            timestamp: Date.now(),
            payload: {
              id: nuevoId,
              nombre: 'Nuevo Pro',
              usuario: usuarioNuevo,
              rol: 'dependiente',
              activo: true,
              pinHash: nuevoPinHash,
              version: 1,
            },
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.results[0].estado, push.body.results[0].error).toBe('aplicada');

    const respuesta = await request(app).post('/api/auth/usuario').send({
      usuario: usuarioNuevo,
      pin: '5678',
      fingerprint: `nuevo-login-${sufijo}`,
      nombre: 'Navegador',
      plataforma: 'web',
    });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('dependiente');
    expect(respuesta.body.usuario.id).toBe(nuevoId);
  });
});
