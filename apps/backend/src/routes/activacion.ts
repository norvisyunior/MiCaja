import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { activacionSchema } from '@micaja/shared';
import { env } from '../config';
import { withAdmin } from '../db';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { signDeviceToken } from '../middleware/auth';
import { registrarAuditoria } from '../services/auditoria';
import {
  construirPayloadLicencia,
  firmarLicencia,
  hashCodigoActivacion,
} from '../services/licencias';

interface LicenciaActivacionRow {
  id: string;
  empresa_id: string;
  plan_id: string;
  estado: string;
  vence_en: Date;
  grace_dias: number;
  features: string[];
  codigo_usado_en: Date | null;
  codigo_expira_en: Date | null;
  empresa_nombre: string;
  empresa_estado: string;
  plan_codigo: string;
  plan_features: string[];
  max_dispositivos: number | null;
}

interface DispositivoRow {
  id: string;
  nombre: string;
  plataforma: string;
  estado: string;
}

interface InvitacionRow {
  id: string;
  empresa_id: string;
  rol: string;
  expira_en: Date;
  usado_en: Date | null;
}

export const activacionRouter = Router();

// Los códigos tienen mucha entropía, pero un limitador específico evita que
// se use la activación como oráculo de fuerza bruta desde una misma IP.
const limitadorActivacion = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
});

/**
 * Activa un dispositivo de un negocio. El mismo endpoint cubre tres caminos:
 *
 * 1. Código de activación del negocio (propietario).
 * 2. Código de invitación de trabajador (rol asignado por la invitación).
 * 3. Reemplazo: cuando no quedan plazas y el propietario indica
 *    `reemplazarA`, se retira ese dispositivo y se activa el nuevo en su
 *    lugar, sin cambiar el total de plazas ocupadas.
 */
activacionRouter.post(
  '/activar',
  limitadorActivacion,
  asyncHandler(async (req, res) => {
    const data = activacionSchema.parse(req.body);
    const hash = hashCodigoActivacion(data.codigo);

    const resultado = await withAdmin(async (client) => {
      const licenciaResultado = await client.query<LicenciaActivacionRow>(
        `select l.id, l.empresa_id, l.plan_id, l.estado, l.vence_en, l.grace_dias,
                l.features, l.codigo_usado_en, l.codigo_expira_en,
                e.nombre as empresa_nombre, e.estado as empresa_estado,
                p.codigo as plan_codigo, p.features as plan_features,
                p.max_dispositivos
         from licencias l
         join empresas e on e.id = l.empresa_id
         join planes p on p.id = l.plan_id
         where l.codigo_activacion_hash = $1`,
        [hash]
      );

      // La invitación es un código alterno de la misma licencia: activa el
      // dispositivo y asigna el rol del trabajador invitado.
      let invitacion: InvitacionRow | null = null;
      if (!licenciaResultado.rowCount) {
        const invitacionResultado = await client.query<InvitacionRow>(
          `select id, empresa_id, rol, expira_en, usado_en
           from invitaciones where codigo_hash = $1`,
          [hash]
        );
        const fila = invitacionResultado.rows[0];
        if (!fila) {
          throw new ApiError(404, 'CODIGO_INVALIDO');
        }
        if (fila.usado_en) {
          throw new ApiError(409, 'INVITACION_USADA', 'Ese código de invitación ya fue utilizado.');
        }
        if (fila.expira_en.getTime() < Date.now()) {
          throw new ApiError(410, 'INVITACION_EXPIRADA', 'El código de invitación expiró.');
        }
        invitacion = fila;

        const licenciaDeEmpresa = await client.query<LicenciaActivacionRow>(
          `select l.id, l.empresa_id, l.plan_id, l.estado, l.vence_en, l.grace_dias,
                  l.features, l.codigo_usado_en, l.codigo_expira_en,
                  e.nombre as empresa_nombre, e.estado as empresa_estado,
                  p.codigo as plan_codigo, p.features as plan_features,
                  p.max_dispositivos
           from licencias l
           join empresas e on e.id = l.empresa_id
           join planes p on p.id = l.plan_id
           where l.empresa_id = $1`,
          [fila.empresa_id]
        );
        if (!licenciaDeEmpresa.rowCount) {
          throw new ApiError(404, 'CODIGO_INVALIDO');
        }
        licenciaResultado.rows[0] = licenciaDeEmpresa.rows[0];
      }

      const licencia = licenciaResultado.rows[0];
      const viaInvitacion = invitacion !== null;
      // El rol sale de la invitación (validada al crearla) o es propietario
      // cuando se activa con el código del negocio. Una fila corrupta de
      // invitación nunca puede conceder `propietario`.
      const rolDispositivo: 'propietario' | 'admin' | 'dependiente' = !viaInvitacion
        ? 'propietario'
        : invitacion!.rol === 'admin'
          ? 'admin'
          : 'dependiente';

      // Una instalación pertenece a un solo negocio: si esta misma huella ya
      // está registrada en otra empresa, activarla aquí mezclaría los datos
      // locales de ambas. Se pide limpiar/restaurar el dispositivo.
      const otraEmpresa = await client.query<{ empresa_id: string }>(
        `select empresa_id from dispositivos
         where fingerprint = $1 and empresa_id <> $2
         limit 1`,
        [data.fingerprint, licencia.empresa_id]
      );
      if (otraEmpresa.rowCount) {
        throw new ApiError(
          409,
          'DISPOSITIVO_OTRA_EMPRESA',
          'Este dispositivo ya está vinculado a otro negocio. Para usarlo en este negocio, borra los datos de la app (o restaura un respaldo del negocio correcto) y vuelve a activarlo.'
        );
      }

      const dispositivoExistente = await client.query<DispositivoRow>(
        `select id, nombre, plataforma, estado
         from dispositivos
         where empresa_id = $1 and fingerprint = $2`,
        [licencia.empresa_id, data.fingerprint]
      );

      // Reintento idempotente: si el código ya se usó pero este mismo
      // dispositivo ya existe, se reemite su licencia en lugar de fallar.
      if (!viaInvitacion && licencia.codigo_usado_en && !dispositivoExistente.rowCount) {
        throw new ApiError(409, 'CODIGO_USADO');
      }
      if (
        !viaInvitacion &&
        !licencia.codigo_usado_en &&
        licencia.codigo_expira_en &&
        licencia.codigo_expira_en.getTime() < Date.now()
      ) {
        throw new ApiError(410, 'CODIGO_EXPIRADO');
      }
      if (licencia.estado === 'suspendida') {
        throw new ApiError(403, 'LICENCIA_SUSPENDIDA');
      }
      if (licencia.estado === 'vencida' || licencia.vence_en.getTime() < Date.now()) {
        throw new ApiError(403, 'LICENCIA_VENCIDA');
      }
      if (
        licencia.empresa_estado === 'suspendida' ||
        licencia.empresa_estado === 'cancelada'
      ) {
        throw new ApiError(403, 'EMPRESA_SUSPENDIDA');
      }

      if (dispositivoExistente.rows[0]?.estado === 'bloqueado') {
        throw new ApiError(403, 'DISPOSITIVO_BLOQUEADO');
      }

      let reemplazadoId: string | null = null;
      if (!dispositivoExistente.rowCount && licencia.max_dispositivos !== null) {
        const conteo = await client.query<{ total: number }>(
          `select count(*)::int as total from dispositivos
           where empresa_id = $1 and estado = 'activo'`,
          [licencia.empresa_id]
        );
        if (conteo.rows[0].total >= licencia.max_dispositivos) {
          // Sin plazas: solo el código del propietario permite reemplazar un
          // dispositivo existente. Con invitación o sin destino se explica
          // qué dispositivos ocupan las plazas para poder liberar una.
          if (!viaInvitacion && data.reemplazarA) {
            const objetivo = await client.query<DispositivoRow>(
              `select id, nombre, plataforma, estado
               from dispositivos
               where empresa_id = $1 and id = $2`,
              [licencia.empresa_id, data.reemplazarA]
            );
            if (!objetivo.rowCount) {
              throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
            }
            if (objetivo.rows[0].estado !== 'activo') {
              throw new ApiError(
                409,
                'DISPOSITIVO_NO_ACTIVO',
                'El dispositivo indicado ya está desvinculado.'
              );
            }
            await client.query(
              `update dispositivos
               set estado = 'inactivo', licencia_firmada = null, licencia_emitida_en = null
               where empresa_id = $1 and id = $2`,
              [licencia.empresa_id, data.reemplazarA]
            );
            reemplazadoId = data.reemplazarA;
          } else {
            const ocupadas = await client.query<{
              id: string;
              nombre: string;
              plataforma: string;
              last_seen_at: Date | null;
            }>(
              `select id, nombre, plataforma, last_seen_at
               from dispositivos
               where empresa_id = $1 and estado = 'activo'
               order by created_at asc`,
              [licencia.empresa_id]
            );
            throw new ApiError(
              409,
              'LIMITE_DISPOSITIVOS',
              `El plan permite ${licencia.max_dispositivos} dispositivo(s) y ya están ocupados.`,
              {
                maxDispositivos: licencia.max_dispositivos,
                dispositivos: ocupadas.rows.map((fila) => ({
                  id: fila.id,
                  nombre: fila.nombre,
                  plataforma: fila.plataforma,
                  lastSeenAt: fila.last_seen_at?.toISOString() ?? null,
                })),
              }
            );
          }
        }
      }

      const dispositivo = await client.query<DispositivoRow>(
        `insert into dispositivos
           (empresa_id, nombre, plataforma, app_version, fingerprint, estado, rol,
            last_seen_at)
         values ($1, $2, $3, $4, $5, 'activo', $6, now())
         on conflict (empresa_id, fingerprint) do update set
           nombre = excluded.nombre,
           plataforma = excluded.plataforma,
           app_version = excluded.app_version,
           estado = 'activo',
           rol = excluded.rol,
           last_seen_at = now()
         returning id, nombre, plataforma, estado`,
        [
          licencia.empresa_id,
          data.nombre,
          data.plataforma,
          data.appVersion,
          data.fingerprint,
          rolDispositivo,
        ]
      );
      const deviceId = dispositivo.rows[0].id;

      if (invitacion) {
        await client.query(
          `update invitaciones
           set usado_en = now(), dispositivo_id = $2, updated_at = now()
           where id = $1`,
          [invitacion.id, deviceId]
        );
      }

      const features =
        Array.isArray(licencia.features) && licencia.features.length > 0
          ? licencia.features
          : licencia.plan_features;

      const payload = construirPayloadLicencia({
        licenseId: licencia.id,
        empresaId: licencia.empresa_id,
        deviceId,
        plan: licencia.plan_codigo,
        features,
        venceEn: licencia.vence_en,
        graceDias: licencia.grace_dias,
      });
      const token = firmarLicencia(payload);

      await client.query(
        `update dispositivos
         set licencia_firmada = $2, licencia_emitida_en = now()
         where id = $1`,
        [deviceId, token]
      );

      if (viaInvitacion) {
        await client.query(
          `update licencias set
             estado = 'activa',
             activada_en = coalesce(activada_en, now())
           where id = $1`,
          [licencia.id]
        );
      } else {
        await client.query(
          `update licencias set
             estado = 'activa',
             activada_en = coalesce(activada_en, now()),
             codigo_usado_en = now()
           where id = $1`,
          [licencia.id]
        );
      }

      await client.query(
        `update empresas set estado = 'activa'
         where id = $1 and estado = 'pendiente'`,
        [licencia.empresa_id]
      );

      await client.query(
        `insert into licencias_eventos (licencia_id, empresa_id, tipo, payload)
         values ($1, $2, 'activada', $3)`,
        [
          licencia.id,
          licencia.empresa_id,
          JSON.stringify({
            deviceId,
            nombre: data.nombre,
            plataforma: data.plataforma,
            via: viaInvitacion ? 'invitacion' : 'codigo',
            ...(reemplazadoId ? { reemplazoDe: reemplazadoId } : {}),
          }),
        ]
      );

      if (reemplazadoId) {
        await registrarAuditoria(client, {
          empresaId: licencia.empresa_id,
          actorTipo: 'dispositivo',
          actorId: deviceId,
          accion: 'dispositivo.reemplazado',
          entidad: 'dispositivos',
          entidadId: deviceId,
          payload: { reemplazado: reemplazadoId, nombre: data.nombre },
          ip: req.ip,
        });
      }

      await registrarAuditoria(client, {
        empresaId: licencia.empresa_id,
        actorTipo: 'dispositivo',
        actorId: deviceId,
        accion: 'licencia.activada',
        entidad: 'dispositivos',
        entidadId: deviceId,
        payload: {
          plataforma: data.plataforma,
          appVersion: data.appVersion,
          via: viaInvitacion ? 'invitacion' : 'codigo',
        },
        ip: req.ip,
      });

      const deviceToken = signDeviceToken({
        deviceId,
        empresaId: licencia.empresa_id,
        licenseId: licencia.id,
      });

      return {
        token: deviceToken,
        licencia: token,
        empresa: {
          id: licencia.empresa_id,
          nombre: licencia.empresa_nombre,
        },
        dispositivo: {
          id: deviceId,
          nombre: dispositivo.rows[0].nombre,
          plataforma: dispositivo.rows[0].plataforma,
        },
        venceEn: licencia.vence_en.toISOString(),
        features,
        via: viaInvitacion ? 'invitacion' : 'codigo',
        rol: rolDispositivo,
      };
    });

    res.status(201).json(resultado);
  })
);
