import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

/**
 * Login de una cuenta de negocio usando solo usuario + PIN. Es el camino de
 * recuperación cuando el dispositivo no tiene la cuenta local (instalación
 * nueva, otro navegador, datos borrados) pero ya estaba invitado o activado.
 *
 * El servidor busca al usuario globalmente, verifica su PIN sincronizado y
 * registra la instalación por huella solo para auditoría. La licencia es del
 * negocio: ni la huella ni el número de instalaciones limitan el acceso.
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

      // La huella solo identifica la instalación para auditoría: no ata el
      // dispositivo a un negocio ni limita cuántas instalaciones puede haber.

      const existente = await client.query<DispositivoRow>(
        `select id, nombre, plataforma, estado, rol
         from dispositivos
         where empresa_id = $1 and fingerprint = $2`,
        [usuario.empresa_id, data.fingerprint]
      );
      const dispositivoExistente = existente.rows[0];

      let dispositivo: DispositivoRow;

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

      const features =
        Array.isArray(usuario.licencia_features) && usuario.licencia_features.length > 0
          ? usuario.licencia_features
          : (usuario.plan_features ?? []);

      let licenciaFirmada: string | null = null;

      if (estadoLicencia === 'activa') {
        licenciaFirmada = firmarLicencia(
          construirPayloadLicencia({
            licenseId: usuario.licencia_id,
            empresaId: usuario.empresa_id,
            plan: usuario.plan_codigo,
            features,
            venceEn: usuario.vence_en,
            graceDias: usuario.grace_dias,
          })
        );

        await client.query(
          `update dispositivos
           set licencia_firmada = $2, licencia_emitida_en = now()
           where empresa_id = $1`,
          [usuario.empresa_id, licenciaFirmada]
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
            }),
          ]
        );
      } else {
        // La licencia pertenece al negocio, no al dispositivo: un negocio
        // pendiente puede abrir la caja, pero no recibe token ni sincroniza
        // hasta que se active con su propio código.
        await client.query(
          `update dispositivos
           set licencia_firmada = null, licencia_emitida_en = null
           where id = $1`,
          [dispositivo.id]
        );
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
        estadoLicencia,
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
