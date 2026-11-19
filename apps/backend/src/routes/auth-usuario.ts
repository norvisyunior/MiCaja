import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { PoolClient } from 'pg';
import { usuarioLoginSchema } from '@micaja/shared';
import { env } from '../config';
import { withAdmin } from '../db';
import { asyncHandler } from '../middleware/async-handler';
import { signDeviceToken } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { registrarAuditoria } from '../services/auditoria';
import {
  construirPayloadLicencia,
  estadoLicenciaEfectiva,
  firmarLicencia,
} from '../services/licencias';
import { PIN_HASH_FICTICIO, verificarPinServidor } from '../services/pin';

type RolUsuario = 'propietario' | 'admin' | 'dependiente';

interface UsuarioLoginRow {
  usuario_id: string;
  empresa_id: string;
  usuario_nombre: string;
  usuario_usuario: string;
  usuario_rol: RolUsuario;
  usuario_activo: boolean;
  usuario_version: number;
  password_hash: string | null;
  empresa_nombre: string;
  empresa_estado: string;
  licencia_id: string;
  licencia_estado: string;
  vence_en: Date;
  grace_dias: number;
  licencia_features: string[] | null;
  plan_codigo: string;
  plan_features: string[] | null;
  max_dispositivos: number | null;
}

interface DispositivoRow {
  id: string;
  nombre: string;
  plataforma: string;
  estado: string;
  rol: RolUsuario;
}

export const authUsuarioRouter = Router();

// El PIN tiene solo 10.000 combinaciones: sin límite por IP un atacante podría
// recorrerlas. El bloqueo local no protege al servidor, así que se limita aquí.
const limitadorLoginUsuario = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: 'DEMASIADOS_INTENTOS',
    message: 'Demasiados intentos de inicio de sesión. Espera unos minutos.',
  },
});

async function dispositivosOcupados(
  client: PoolClient,
  empresaId: string
): Promise<{ id: string; nombre: string; plataforma: string; last_seen_at: Date | null }[]> {
  const resultado = await client.query<{
    id: string;
    nombre: string;
    plataforma: string;
    last_seen_at: Date | null;
  }>(
    `select id, nombre, plataforma, last_seen_at
     from dispositivos
     where empresa_id = $1 and estado = 'activo'
     order by created_at asc`,
    [empresaId]
  );
  return resultado.rows;
}

/**
 * Login de una cuenta de negocio usando solo usuario + PIN. Es el camino de
 * recuperación cuando el dispositivo no tiene la cuenta local (instalación
 * nueva, otro navegador, datos borrados) pero ya estaba invitado o activado.
 *
 * El servidor busca al usuario globalmente, verifica su PIN sincronizado y
 * reutiliza el dispositivo por huella. Si la huella es nueva o estaba inactiva:
 * - cualquier rol ocupa una plaza libre;
 * - sin plazas, un dependiente necesita una invitación o que se libere una;
 * - solo el propietario puede reemplazar un dispositivo cuando no hay plazas.
 * Con `cambiarEmpresa` el servidor libera la huella del negocio anterior antes
 * de vincularla al nuevo, dentro de la misma transacción.
 */
authUsuarioRouter.post(
  '/usuario',
  limitadorLoginUsuario,
  asyncHandler(async (req, res) => {
    const data = usuarioLoginSchema.parse(req.body);

    const resultado = await withAdmin(async (client) => {
      const busqueda = await client.query<UsuarioLoginRow>(
        `select u.id as usuario_id, u.empresa_id,
                u.nombre as usuario_nombre, u.usuario as usuario_usuario,
                u.rol as usuario_rol, u.activo as usuario_activo,
                u.version as usuario_version, u.password_hash,
                e.nombre as empresa_nombre, e.estado as empresa_estado,
                l.id as licencia_id, l.estado as licencia_estado,
                l.vence_en, l.grace_dias, l.features as licencia_features,
                p.codigo as plan_codigo, p.features as plan_features,
                p.max_dispositivos
         from usuarios u
         join empresas e on e.id = u.empresa_id
         join licencias l on l.empresa_id = u.empresa_id
         join planes p on p.id = l.plan_id
         where lower(u.usuario) = $1
           and u.deleted_at is null
           and e.deleted_at is null
         order by u.created_at asc
         limit 1`,
        [data.usuario]
      );

      const usuario = busqueda.rows[0];
      // Verificar contra un hash ficticio mantiene un tiempo similar cuando el
      // usuario no existe o nunca sincronizó su PIN.
      const pinValido = verificarPinServidor(
        data.pin,
        usuario?.password_hash ?? PIN_HASH_FICTICIO
      );
      if (!usuario || !usuario.password_hash || !pinValido) {
        throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o PIN incorrectos.');
      }

      if (!usuario.usuario_activo) {
        throw new ApiError(403, 'USUARIO_INACTIVO');
      }
      if (
        usuario.empresa_estado === 'suspendida' ||
        usuario.empresa_estado === 'cancelada'
      ) {
        throw new ApiError(403, 'EMPRESA_SUSPENDIDA');
      }

      const estadoLicencia = estadoLicenciaEfectiva({
        estado: usuario.licencia_estado,
        vence_en: usuario.vence_en,
        grace_dias: usuario.grace_dias,
      });
      if (estadoLicencia === 'suspendida') {
        throw new ApiError(403, 'LICENCIA_SUSPENDIDA');
      }
      if (estadoLicencia === 'vencida') {
        throw new ApiError(403, 'LICENCIA_VENCIDA');
      }

      const otraEmpresa = await client.query<{
        empresa_id: string;
        empresa_nombre: string;
      }>(
        `select d.empresa_id, e.nombre as empresa_nombre
         from dispositivos d
         join empresas e on e.id = d.empresa_id
         where d.fingerprint = $1 and d.empresa_id <> $2
         order by d.created_at asc
         limit 1`,
        [data.fingerprint, usuario.empresa_id]
      );
      if (otraEmpresa.rowCount && !data.cambiarEmpresa) {
        const vinculada = otraEmpresa.rows[0];
        throw new ApiError(
          409,
          'DISPOSITIVO_OTRA_EMPRESA',
          'Este dispositivo ya está vinculado a otro negocio. Confirma el cambio para borrar sus datos locales y entrar aquí.',
          {
            empresa: { id: usuario.empresa_id, nombre: usuario.empresa_nombre },
            empresaActual: {
              id: vinculada.empresa_id,
              nombre: vinculada.empresa_nombre,
            },
          }
        );
      }

      const existente = await client.query<DispositivoRow>(
        `select id, nombre, plataforma, estado, rol
         from dispositivos
         where empresa_id = $1 and fingerprint = $2`,
        [usuario.empresa_id, data.fingerprint]
      );
      const dispositivoExistente = existente.rows[0];

      if (dispositivoExistente?.estado === 'bloqueado') {
        throw new ApiError(403, 'DISPOSITIVO_BLOQUEADO');
      }

      let dispositivo: DispositivoRow;
      let reemplazadoId: string | null = null;

      // Un dispositivo inactivo puede reactivarse si la cuenta lo autoriza y
      // hay una plaza libre (o el propietario decide reemplazar otra).
      const necesitaPlaza =
        !dispositivoExistente || dispositivoExistente.estado === 'inactivo';

      if (necesitaPlaza) {
        const ocupadas = await dispositivosOcupados(client, usuario.empresa_id);
        const sinPlazas =
          usuario.max_dispositivos !== null && ocupadas.length >= usuario.max_dispositivos;

        if (sinPlazas) {
          if (usuario.usuario_rol === 'dependiente') {
            throw new ApiError(
              409,
              'ACTIVACION_REQUERIDA',
              'El plan del negocio no tiene dispositivos libres. Pide a un administrador una invitación o que libere una plaza.',
              { empresa: { id: usuario.empresa_id, nombre: usuario.empresa_nombre } }
            );
          }
          if (!data.reemplazarA) {
            throw new ApiError(
              409,
              'LIMITE_DISPOSITIVOS',
              `El plan permite ${usuario.max_dispositivos} dispositivo(s) y ya están ocupados.`,
              {
                maxDispositivos: usuario.max_dispositivos,
                dispositivos: ocupadas.map((fila) => ({
                  id: fila.id,
                  nombre: fila.nombre,
                  plataforma: fila.plataforma,
                  lastSeenAt: fila.last_seen_at?.toISOString() ?? null,
                })),
              }
            );
          }
          if (usuario.usuario_rol !== 'propietario') {
            throw new ApiError(
              403,
              'ROL_INSUFICIENTE',
              'Solo el propietario puede reemplazar un dispositivo cuando el plan está completo.'
            );
          }

          const objetivo = await client.query<DispositivoRow>(
            `select id, nombre, plataforma, estado, rol
             from dispositivos
             where empresa_id = $1 and id = $2`,
            [usuario.empresa_id, data.reemplazarA]
          );
          const filaObjetivo = objetivo.rows[0];
          if (!filaObjetivo) {
            throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
          }
          if (filaObjetivo.estado !== 'activo') {
            throw new ApiError(
              409,
              'DISPOSITIVO_NO_ACTIVO',
              'El dispositivo indicado ya está desvinculado.'
            );
          }

          await client.query(
            `update dispositivos
             set estado = 'inactivo', licencia_firmada = null, licencia_emitida_en = null,
                 updated_at = now()
             where empresa_id = $1 and id = $2`,
            [usuario.empresa_id, data.reemplazarA]
          );
          reemplazadoId = data.reemplazarA;
        }
      }

      // El cambio de negocio libera la huella en el negocio anterior. Se hace
      // solo cuando el login ya pasó todas las validaciones, dentro de la misma
      // transacción, para no dejar al usuario sin dispositivo si algo falla.
      let empresaAnteriorId: string | null = null;
      if (data.cambiarEmpresa && otraEmpresa.rowCount) {
        empresaAnteriorId = otraEmpresa.rows[0].empresa_id;
        await client.query(
          `update dispositivos
           set estado = 'inactivo', licencia_firmada = null,
               licencia_emitida_en = null, updated_at = now()
           where fingerprint = $1 and empresa_id <> $2`,
          [data.fingerprint, usuario.empresa_id]
        );
      }

      if (dispositivoExistente?.estado === 'activo') {
        const actualizado = await client.query<DispositivoRow>(
          `update dispositivos
           set plataforma = $3, app_version = $4, last_seen_at = now(), updated_at = now()
           where empresa_id = $1 and id = $2
           returning id, nombre, plataforma, estado, rol`,
          [usuario.empresa_id, dispositivoExistente.id, data.plataforma, data.appVersion]
        );
        dispositivo = actualizado.rows[0];
      } else if (dispositivoExistente) {
        const reactivado = await client.query<DispositivoRow>(
          `update dispositivos
           set estado = 'activo', rol = $3, plataforma = $4, app_version = $5,
               licencia_firmada = null, licencia_emitida_en = null,
               last_seen_at = now(), updated_at = now()
           where empresa_id = $1 and id = $2
           returning id, nombre, plataforma, estado, rol`,
          [
            usuario.empresa_id,
            dispositivoExistente.id,
            usuario.usuario_rol,
            data.plataforma,
            data.appVersion,
          ]
        );
        dispositivo = reactivado.rows[0];
      } else {
        const creado = await client.query<DispositivoRow>(
          `insert into dispositivos
             (empresa_id, nombre, plataforma, app_version, fingerprint, estado, rol,
              last_seen_at)
           values ($1, $2, $3, $4, $5, 'activo', $6, now())
           returning id, nombre, plataforma, estado, rol`,
          [
            usuario.empresa_id,
            data.nombre,
            data.plataforma,
            data.appVersion,
            data.fingerprint,
            usuario.usuario_rol,
          ]
        );
        dispositivo = creado.rows[0];
      }

      if (empresaAnteriorId) {
        await registrarAuditoria(client, {
          empresaId: empresaAnteriorId,
          actorTipo: 'usuario',
          actorId: usuario.usuario_id,
          accion: 'dispositivo.cambio_empresa',
          entidad: 'dispositivos',
          entidadId: dispositivo.id,
          payload: {
            empresaDestino: usuario.empresa_id,
            fingerprint: data.fingerprint,
          },
          ip: req.ip,
        });
      }

      const features =
        Array.isArray(usuario.licencia_features) && usuario.licencia_features.length > 0
          ? usuario.licencia_features
          : (usuario.plan_features ?? []);

      const licenciaFirmada = firmarLicencia(
        construirPayloadLicencia({
          licenseId: usuario.licencia_id,
          empresaId: usuario.empresa_id,
          deviceId: dispositivo.id,
          plan: usuario.plan_codigo,
          features,
          venceEn: usuario.vence_en,
          graceDias: usuario.grace_dias,
        })
      );

      await client.query(
        `update dispositivos
         set licencia_firmada = $2, licencia_emitida_en = now()
         where id = $1`,
        [dispositivo.id, licenciaFirmada]
      );

      await client.query(
        `update licencias set
           estado = 'activa',
           activada_en = coalesce(activada_en, now())
         where id = $1`,
        [usuario.licencia_id]
      );
      await client.query(
        `update empresas set estado = 'activa'
         where id = $1 and estado = 'pendiente'`,
        [usuario.empresa_id]
      );

      await client.query(
        `insert into licencias_eventos (licencia_id, empresa_id, tipo, payload)
         values ($1, $2, 'activada', $3)`,
        [
          usuario.licencia_id,
          usuario.empresa_id,
          JSON.stringify({
            deviceId: dispositivo.id,
            nombre: dispositivo.nombre,
            plataforma: data.plataforma,
            via: 'login',
            usuarioId: usuario.usuario_id,
            ...(reemplazadoId ? { reemplazoDe: reemplazadoId } : {}),
          }),
        ]
      );

      if (reemplazadoId) {
        await registrarAuditoria(client, {
          empresaId: usuario.empresa_id,
          actorTipo: 'usuario',
          actorId: usuario.usuario_id,
          accion: 'dispositivo.reemplazado',
          entidad: 'dispositivos',
          entidadId: dispositivo.id,
          payload: { reemplazado: reemplazadoId, nombre: dispositivo.nombre },
          ip: req.ip,
        });
      }

      await registrarAuditoria(client, {
        empresaId: usuario.empresa_id,
        actorTipo: 'usuario',
        actorId: usuario.usuario_id,
        accion: 'usuario.login',
        entidad: 'dispositivos',
        entidadId: dispositivo.id,
        payload: {
          plataforma: data.plataforma,
          appVersion: data.appVersion,
          nuevoDispositivo: !dispositivoExistente,
        },
        ip: req.ip,
      });

      return {
        token: signDeviceToken({
          deviceId: dispositivo.id,
          empresaId: usuario.empresa_id,
          licenseId: usuario.licencia_id,
        }),
        licencia: licenciaFirmada,
        empresa: {
          id: usuario.empresa_id,
          nombre: usuario.empresa_nombre,
        },
        dispositivo: {
          id: dispositivo.id,
          nombre: dispositivo.nombre,
          plataforma: dispositivo.plataforma,
        },
        venceEn: usuario.vence_en.toISOString(),
        features,
        via: 'login' as const,
        rol: dispositivo.rol,
        usuario: {
          id: usuario.usuario_id,
          nombre: usuario.usuario_nombre,
          usuario: usuario.usuario_usuario,
          rol: usuario.usuario_rol,
          activo: usuario.usuario_activo,
          version: usuario.usuario_version,
        },
      };
    });

    res.status(200).json(resultado);
  })
);
