import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ErrorApi,
  type RespuestaLoginUsuario,
} from '../api/cliente';
import type { Usuario } from '../types';
import {
  CLAVE_CODIGO_PENDIENTE,
  CLAVE_EMPRESA_SERVIDOR,
  CLAVE_FINGERPRINT_DISPOSITIVO,
  CLAVE_ROL_ACTIVACION,
  leerSetting,
} from '../api/config';
import { ahoraIso, obtenerContextoLocal } from '../db/contexto';
import { obtenerUsuario } from '../db/repos/catalogo';
import { guardarSetting, guardarSettingLocal } from '../db/repos/settings';
import { marcarSnapshotInicialHecho } from '../db/sync/encolar';
import { evaluarTokenLicencia } from '../licencias/verificar';
import { crearPinHash } from '../utils/pin';
import { normalizarUsuario } from '../utils/usuario';
import {
  contarDatosLocales,
  guardarActivacion,
  guardarSesionSinLicencia,
  restablecerDispositivo,
} from './activacion';

interface FilaUsuarioLocal {
  id: number;
  deleted_at: string | null;
}

async function buscarUsuarioLocal(
  db: SQLiteDatabase,
  uuid: string,
  usuario: string
): Promise<{ porUuid: FilaUsuarioLocal | null; porUsuario: FilaUsuarioLocal | null }> {
  const porUuid = await db.getFirstAsync<FilaUsuarioLocal>(
    `SELECT id, deleted_at FROM usuarios WHERE uuid = ?`,
    uuid
  );
  const porUsuario = await db.getFirstAsync<FilaUsuarioLocal>(
    `SELECT id, deleted_at FROM usuarios
     WHERE usuario = ? COLLATE NOCASE
     ORDER BY (deleted_at IS NULL) DESC, id ASC
     LIMIT 1`,
    usuario
  );
  return { porUuid, porUsuario };
}

async function guardarUsuarioLocal(
  db: SQLiteDatabase,
  respuesta: RespuestaLoginUsuario,
  pinHash: string
): Promise<number> {
  const contexto = await obtenerContextoLocal(db);
  const ahora = ahoraIso();
  const usuarioNormalizado = normalizarUsuario(respuesta.usuario.usuario);
  const rolLocal = respuesta.usuario.rol === 'dependiente' ? 'dependiente' : 'admin';
  const version = Math.max(1, respuesta.usuario.version);
  let id = 0;

  const { porUuid, porUsuario } = await buscarUsuarioLocal(
    db,
    respuesta.usuario.id,
    usuarioNormalizado
  );

  if (porUuid && porUsuario && porUuid.id !== porUsuario.id) {
    if (porUsuario.deleted_at === null) {
      throw new ErrorApi(
        'DISPOSITIVO_CON_DATOS',
        'Ya existe otra cuenta local con ese usuario. Elige otro nombre de usuario o pide al administrador que lo cambie.',
        409,
        { motivo: 'usuario_duplicado' }
      );
    }
    await db.runAsync(
      `UPDATE usuarios SET usuario = ? || '-borrado-' || id WHERE id = ?`,
      usuarioNormalizado,
      porUsuario.id
    );
  }

  const existente = porUuid ?? porUsuario;
  if (existente) {
    id = existente.id;
    await db.runAsync(
      `UPDATE usuarios
       SET uuid = ?, empresa_id = ?, nombre = ?, usuario = ?, rol = ?, pin = ?,
           activo = ?, intentos_fallidos = 0, bloqueado_hasta = NULL,
           deleted_at = NULL, version = ?, updated_at = ?
       WHERE id = ?`,
      respuesta.usuario.id,
      contexto.empresaId,
      respuesta.usuario.nombre,
      usuarioNormalizado,
      rolLocal,
      pinHash,
      respuesta.usuario.activo ? 1 : 0,
      version,
      ahora,
      id
    );
  } else {
    const creado = await db.runAsync(
      `INSERT INTO usuarios
         (uuid, empresa_id, nombre, usuario, rol, pin, codigo_recuperacion,
          activo, intentos_fallidos, bloqueado_hasta, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, NULL, ?, NULL, ?)`,
      respuesta.usuario.id,
      contexto.empresaId,
      respuesta.usuario.nombre,
      usuarioNormalizado,
      rolLocal,
      pinHash,
      respuesta.usuario.activo ? 1 : 0,
      ahora,
      version
    );
    id = creado.lastInsertRowId;
  }

  return id;
}

/**
 * Persiste una sesión validada por el servidor. Antes de tocar datos se
 * comprueba que la instalación no pertenezca a otro negocio y que la licencia
 * recibida corresponda a esta empresa/dispositivo. `reiniciar` solo se usa
 * cuando el usuario ya confirmó que se borre el negocio local para entrar en
 * otro. Después deja el snapshot marcado: el login global descarga la foto del
 * negocio, no la sube.
 */
export async function guardarLoginGlobal(
  db: SQLiteDatabase,
  respuesta: RespuestaLoginUsuario,
  pin: string,
  fingerprint: string,
  opciones: { reiniciar?: boolean } = {}
): Promise<Usuario | null> {
  const empresaActual = await leerSetting(db, CLAVE_EMPRESA_SERVIDOR);
  const cambiaEmpresa = !!empresaActual && empresaActual !== respuesta.empresa.id;

  if (cambiaEmpresa && !opciones.reiniciar) {
    throw new ErrorApi(
      'DISPOSITIVO_OTRA_EMPRESA',
      'Este dispositivo está vinculado a otro negocio. Confirma el cambio para borrar sus datos locales y entrar aquí.',
      409,
      { motivo: 'otra_empresa' }
    );
  }

  if (!empresaActual && !opciones.reiniciar) {
    const datos = await contarDatosLocales(db);
    if (
      datos.usuarios > 0 ||
      datos.ventas > 0 ||
      datos.gastos > 0 ||
      datos.movimientosCaja > 0 ||
      datos.conteos > 0 ||
      datos.outbox > 0
    ) {
      throw new ErrorApi(
        'DISPOSITIVO_CON_DATOS',
        'Este dispositivo ya tiene cuentas o ventas de un negocio local. Confirma que quieres borrarlas para entrar con esta cuenta.',
        409,
        { motivo: 'datos_locales' }
      );
    }
  }

  const conLicencia = Boolean(respuesta.licencia && respuesta.token);
  if (conLicencia) {
    const licencia = evaluarTokenLicencia(respuesta.licencia!, {
      empresaId: respuesta.empresa.id,
      deviceId: respuesta.dispositivo.id,
    });
    if (licencia.estado === 'invalida') {
      throw new ErrorApi(
        'LICENCIA_INVALIDA',
        'La licencia recibida del servidor no es válida para este dispositivo.',
        409
      );
    }
  } else if (!respuesta.token) {
    throw new ErrorApi(
      'LOGIN_INCOMPLETO',
      'El servidor no devolvió la sesión del dispositivo.',
      409
    );
  }

  if (!empresaActual || cambiaEmpresa) {
    await restablecerDispositivo(db);
  }

  if (conLicencia) {
    await guardarActivacion(db, {
      token: respuesta.token!,
      licencia: respuesta.licencia!,
      empresa: respuesta.empresa,
      dispositivo: respuesta.dispositivo,
      venceEn: respuesta.venceEn,
      features: respuesta.features,
      via: respuesta.via,
      rol: respuesta.rol,
    });
  } else {
    await guardarSesionSinLicencia(db, {
      token: respuesta.token!,
      empresa: respuesta.empresa,
      dispositivo: respuesta.dispositivo,
      estadoLicencia: respuesta.estadoLicencia,
    });
  }
  await guardarSetting(db, CLAVE_FINGERPRINT_DISPOSITIVO, fingerprint);
  await guardarSetting(db, CLAVE_ROL_ACTIVACION, respuesta.rol);
  await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, '');
  if (!empresaActual || cambiaEmpresa) {
    // Nombre provisional para que la interfaz no quede vacía antes del pull.
    // Es SOLO local: encolarlo sobrescribiría en el servidor el nombre real
    // que el negocio ya tiene configurado.
    await guardarSettingLocal(db, 'nombre_negocio', respuesta.empresa.nombre);
  }

  const pinHash = await crearPinHash(pin);
  let usuarioId = 0;
  await db.withTransactionAsync(async () => {
    usuarioId = await guardarUsuarioLocal(db, respuesta, pinHash);
  });

  // Con licencia activa el login decide descargar la foto del negocio. Sin
  // licencia no se marca: `sincronizar` lo hará cuando el pull (de consulta o
  // ya renovado) haya terminado bien.
  if (conLicencia) {
    await marcarSnapshotInicialHecho(db);
  }

  const usuario = await obtenerUsuario(db, usuarioId);
  if (!usuario) {
    throw new Error('No se pudo crear la cuenta local del usuario.');
  }
  return usuario;
}
