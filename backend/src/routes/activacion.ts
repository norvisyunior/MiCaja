import { Router } from 'express';
import { activacionSchema } from '@micaja/shared';
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

export const activacionRouter = Router();

activacionRouter.post(
  '/activar',
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

      const licencia = licenciaResultado.rows[0];
      if (!licencia) {
        throw new ApiError(404, 'CODIGO_INVALIDO');
      }

      const dispositivoExistente = await client.query<DispositivoRow>(
        `select id, nombre, plataforma, estado
         from dispositivos
         where empresa_id = $1 and fingerprint = $2`,
        [licencia.empresa_id, data.fingerprint]
      );

      // Reintento idempotente: si el código ya se usó pero este mismo
      // dispositivo ya existe, se reemite su licencia en lugar de fallar.
      if (licencia.codigo_usado_en && !dispositivoExistente.rowCount) {
        throw new ApiError(409, 'CODIGO_USADO');
      }
      if (
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

      if (!dispositivoExistente.rowCount && licencia.max_dispositivos !== null) {
        const conteo = await client.query<{ total: number }>(
          `select count(*)::int as total from dispositivos
           where empresa_id = $1 and estado = 'activo'`,
          [licencia.empresa_id]
        );
        if (conteo.rows[0].total >= licencia.max_dispositivos) {
          throw new ApiError(409, 'LIMITE_DISPOSITIVOS');
        }
      }

      const dispositivo = await client.query<DispositivoRow>(
        `insert into dispositivos
           (empresa_id, nombre, plataforma, app_version, fingerprint, estado, last_seen_at)
         values ($1, $2, $3, $4, $5, 'activo', now())
         on conflict (empresa_id, fingerprint) do update set
           nombre = excluded.nombre,
           plataforma = excluded.plataforma,
           app_version = excluded.app_version,
           estado = 'activo',
           last_seen_at = now()
         returning id, nombre, plataforma, estado`,
        [
          licencia.empresa_id,
          data.nombre,
          data.plataforma,
          data.appVersion,
          data.fingerprint,
        ]
      );
      const deviceId = dispositivo.rows[0].id;

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

      await client.query(
        `update licencias set
           estado = 'activa',
           activada_en = coalesce(activada_en, now()),
           codigo_usado_en = now()
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
          JSON.stringify({ deviceId, nombre: data.nombre, plataforma: data.plataforma }),
        ]
      );

      await registrarAuditoria(client, {
        empresaId: licencia.empresa_id,
        actorTipo: 'dispositivo',
        actorId: deviceId,
        accion: 'licencia.activada',
        entidad: 'dispositivos',
        entidadId: deviceId,
        payload: { plataforma: data.plataforma, appVersion: data.appVersion },
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
      };
    });

    res.status(201).json(resultado);
  })
);
