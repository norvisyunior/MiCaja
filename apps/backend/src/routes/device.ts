import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { invitacionSchema } from '@micaja/shared';
import { withTenant } from '../db';
import { requireDevice } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { registrarAuditoria } from '../services/auditoria';
import {
  estadoLicenciaEfectiva,
  generarCodigoActivacion,
  hashCodigoActivacion,
} from '../services/licencias';

export const deviceRouter = Router();

deviceRouter.use(requireDevice);

async function exigirDispositivoActivo(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<void> {
  const fila = await client.query<{ estado: string }>(
    `select estado from dispositivos where empresa_id = $1 and id = $2`,
    [empresaId, deviceId]
  );
  if (!fila.rowCount) {
    throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
  }
  if (fila.rows[0].estado !== 'activo') {
    throw new ApiError(403, 'DISPOSITIVO_INACTIVO');
  }
}

/**
 * Acciones de administración del negocio (invitar, listar o retirar otras
 * terminales). El rol se lee de la base, no del token: si un dispositivo se
 * activó como dependiente no puede elevarse solo cambiando su JWT.
 */
async function exigirGestor(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<void> {
  const fila = await client.query<{ rol: string }>(
    `select rol::text as rol from dispositivos where empresa_id = $1 and id = $2`,
    [empresaId, deviceId]
  );
  if (!fila.rowCount) {
    throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
  }
  if (fila.rows[0].rol !== 'propietario' && fila.rows[0].rol !== 'admin') {
    throw new ApiError(
      403,
      'ROL_INSUFICIENTE',
      'Solo el propietario o un administrador puede gestionar la cuenta del negocio.'
    );
  }
}

deviceRouter.get(
  '/licencia',
  asyncHandler(async (req, res) => {
    const dispositivo = req.device!;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      const fila = await client.query(
        `select l.estado, l.vence_en, l.grace_dias, l.features,
                d.licencia_firmada, d.licencia_emitida_en, d.estado as dispositivo_estado
         from licencias l
         join dispositivos d on d.empresa_id = l.empresa_id
         where l.empresa_id = $1 and d.id = $2`,
        [dispositivo.empresaId, dispositivo.deviceId]
      );
      if (!fila.rowCount) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }

      const licencia = fila.rows[0];
      return {
        estado: estadoLicenciaEfectiva(licencia),
        venceEn: licencia.vence_en.toISOString(),
        graceDias: licencia.grace_dias,
        features: licencia.features,
        token: licencia.licencia_firmada,
        emitidaEn: licencia.licencia_emitida_en?.toISOString() ?? null,
        dispositivoEstado: licencia.dispositivo_estado,
      };
    });

    res.json(resultado);
  })
);

deviceRouter.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const dispositivo = req.device!;
    await withTenant(dispositivo.empresaId, async (client) => {
      await exigirDispositivoActivo(client, dispositivo.empresaId, dispositivo.deviceId);
      await client.query(
        `update dispositivos set last_seen_at = now() where id = $1`,
        [dispositivo.deviceId]
      );
    });
    res.json({ ok: true, serverTime: new Date().toISOString() });
  })
);

/**
 * Lista los dispositivos autorizados del negocio. Sirve para la pantalla de
 * gestión (y para elegir cuál reemplazar cuando se pierde un teléfono).
 */
deviceRouter.get(
  '/dispositivos',
  asyncHandler(async (req, res) => {
    const dispositivo = req.device!;
    const lista = await withTenant(dispositivo.empresaId, async (client) => {
      await exigirDispositivoActivo(client, dispositivo.empresaId, dispositivo.deviceId);
      await exigirGestor(client, dispositivo.empresaId, dispositivo.deviceId);
      const filas = await client.query<{
        id: string;
        nombre: string;
        plataforma: string;
        app_version: string;
        estado: string;
        rol: string;
        licencia_emitida_en: Date | null;
        last_seen_at: Date | null;
        last_sync_at: Date | null;
        created_at: Date;
      }>(
        `select id, nombre, plataforma, app_version, estado, rol::text as rol,
                licencia_emitida_en, last_seen_at, last_sync_at, created_at
         from dispositivos
         where empresa_id = $1
         order by created_at asc`,
        [dispositivo.empresaId]
      );
      return filas.rows.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        plataforma: fila.plataforma,
        appVersion: fila.app_version,
        estado: fila.estado,
        rol: fila.rol,
        esEste: fila.id === dispositivo.deviceId,
        emitidaEn: fila.licencia_emitida_en?.toISOString() ?? null,
        lastSeenAt: fila.last_seen_at?.toISOString() ?? null,
        lastSyncAt: fila.last_sync_at?.toISOString() ?? null,
      }));
    });
    res.json({ dispositivos: lista });
  })
);

/**
 * Desvincula un dispositivo del negocio.
 * - Sin `dispositivoId` (o con el propio id): el dispositivo se desvincula a
 *   sí mismo; el negocio y sus datos no se tocan.
 * - Con `dispositivoId` de otro dispositivo: exige además el código de
 *   activación vigente como verificación de seguridad.
 */
deviceRouter.post(
  '/desvincular',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        dispositivoId: z.string().uuid().optional(),
        codigo: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
          .optional(),
      })
      .parse(req.body ?? {});
    const dispositivo = req.device!;
    const objetivoId = data.dispositivoId ?? dispositivo.deviceId;
    const esOtro = objetivoId !== dispositivo.deviceId;

    if (esOtro && !data.codigo) {
      throw new ApiError(
        403,
        'CODIGO_REQUERIDO',
        'Para desvincular otro dispositivo se necesita el código de activación del negocio.'
      );
    }

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      await exigirDispositivoActivo(client, dispositivo.empresaId, dispositivo.deviceId);

      if (esOtro) {
        await exigirGestor(client, dispositivo.empresaId, dispositivo.deviceId);
        const licencia = await client.query<{
          codigo_activacion_hash: string | null;
          codigo_expira_en: Date | null;
        }>(
          `select codigo_activacion_hash, codigo_expira_en from licencias where empresa_id = $1`,
          [dispositivo.empresaId]
        );
        const codigoFila = licencia.rows[0];
        if (!codigoFila?.codigo_activacion_hash) {
          throw new ApiError(404, 'CODIGO_NO_DISPONIBLE');
        }
        if (
          hashCodigoActivacion(data.codigo!) !== codigoFila.codigo_activacion_hash ||
          (codigoFila.codigo_expira_en && codigoFila.codigo_expira_en.getTime() < Date.now())
        ) {
          throw new ApiError(403, 'CODIGO_INVALIDO');
        }
      }

      const objetivo = await client.query<{ id: string; nombre: string; estado: string }>(
        `update dispositivos
         set estado = 'inactivo', licencia_firmada = null, licencia_emitida_en = null
         where empresa_id = $1 and id = $2 and estado <> 'inactivo'
         returning id, nombre, estado`,
        [dispositivo.empresaId, objetivoId]
      );
      if (!objetivo.rowCount) {
        throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
      }

      await registrarAuditoria(client, {
        empresaId: dispositivo.empresaId,
        actorTipo: 'dispositivo',
        actorId: dispositivo.deviceId,
        accion: esOtro ? 'dispositivo.desvinculado' : 'dispositivo.autodesvinculado',
        entidad: 'dispositivos',
        entidadId: objetivoId,
        payload: { nombre: objetivo.rows[0].nombre },
        ip: req.ip,
      });

      return { id: objetivo.rows[0].id, nombre: objetivo.rows[0].nombre };
    });

    res.json({ ok: true, dispositivo: resultado });
  })
);

/**
 * Genera un código de invitación para que un trabajador instale la app,
 * active su dispositivo y cree su cuenta con el rol de la invitación.
 * Ocupa una plaza de dispositivo igual que la activación con código.
 */
deviceRouter.post(
  '/invitaciones',
  asyncHandler(async (req, res) => {
    const data = invitacionSchema.parse(req.body ?? {});
    const dispositivo = req.device!;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      await exigirDispositivoActivo(client, dispositivo.empresaId, dispositivo.deviceId);
      await exigirGestor(client, dispositivo.empresaId, dispositivo.deviceId);

      const codigo = generarCodigoActivacion();
      const expiraEn = new Date(Date.now() + data.expiraHoras * 3_600_000);

      const creada = await client.query<{ id: string }>(
        `insert into invitaciones (empresa_id, rol, codigo_hash, expira_en)
         values ($1, $2, $3, $4)
         returning id`,
        [dispositivo.empresaId, data.rol, hashCodigoActivacion(codigo), expiraEn]
      );

      await registrarAuditoria(client, {
        empresaId: dispositivo.empresaId,
        actorTipo: 'dispositivo',
        actorId: dispositivo.deviceId,
        accion: 'invitacion.creada',
        entidad: 'invitaciones',
        entidadId: creada.rows[0].id,
        payload: { rol: data.rol, expiraEn: expiraEn.toISOString() },
        ip: req.ip,
      });

      return {
        invitacion: {
          id: creada.rows[0].id,
          rol: data.rol,
          expiraEn: expiraEn.toISOString(),
        },
        // El código se devuelve en claro una sola vez: en la base de datos
        // solo queda su hash.
        codigo,
      };
    });

    res.status(201).json(resultado);
  })
);
