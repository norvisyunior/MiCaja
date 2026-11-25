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
 * 1. Código de activación del negocio (reutilizable mientras esté vigente).
 * 2. Código de invitación de trabajador (rol asignado por la invitación).
 *
 * La licencia es del negocio: la huella de la instalación no restringe ni
 * limita nada, solo se guarda para auditoría.
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

      // La huella solo identifica la instalación para auditoría: no limita
      // negocios ni plazas. La licencia pertenece al negocio y todos sus
      // usuarios comparten la misma vigencia.
      if (
        !viaInvitacion &&
        licencia.codigo_expira_en &&
        licencia.codigo_expira_en.getTime() < Date.now()
      ) {
        throw new ApiError(410, 'CODIGO_EXPIRADO');
      }
      if (licencia.estado === 'suspendida') {
        throw new ApiError(403, 'LICENCIA_SUSPENDIDA');
      }
      // Un código nuevo puede renovar una licencia vencida: el administrador
      // actualiza `vence_en` antes de generarlo. Seguimos rechazando una fecha
      // ya pasada para no firmar un token que volvería a vencer al instante.
      if (licencia.vence_en.getTime() < Date.now()) {
        throw new ApiError(403, 'LICENCIA_VENCIDA');
      }
      if (
        licencia.empresa_estado === 'suspendida' ||
        licencia.empresa_estado === 'cancelada'
      ) {
        throw new ApiError(403, 'EMPRESA_SUSPENDIDA');
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
        plan: licencia.plan_codigo,
        features,
        venceEn: licencia.vence_en,
        graceDias: licencia.grace_dias,
      });
      const token = firmarLicencia(payload);

      await client.query(
        `update dispositivos
         set licencia_firmada = $2, licencia_emitida_en = now()
         where empresa_id = $1`,
        [licencia.empresa_id, token]
      );

      await client.query(
        `update licencias set
           estado = 'activa',
           activada_en = coalesce(activada_en, now())
         where id = $1`,
        [licencia.id]
      );

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
          }),
        ]
      );

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
