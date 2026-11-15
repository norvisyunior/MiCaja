import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ErrorApi,
  pullCambios,
  pushOperaciones,
  type CambioSync,
  type OperacionSync,
} from '../api/cliente';
import {
  CLAVE_LICENCIA_TOKEN,
  CLAVE_ULTIMO_SYNC,
  leerIdsServidor,
  leerSetting,
  leerTokenDispositivo,
} from '../api/config';
import { ahoraIso, obtenerContextoLocal } from '../db/contexto';
import {
  contarOutboxFallidas,
  contarOutboxPendientes,
  eliminarOutbox,
  listarOutboxPendientes,
  marcarOutboxFallida,
  marcarOutboxRechazada,
  reencolarRechazadas,
} from '../db/outbox';
import { guardarSetting } from '../db/repos/settings';
import { encolarSnapshotInicial } from '../db/sync/encolar';
import {
  evaluarTokenLicencia,
  guardarLicenciaLocal,
  verificarLicenciaLocal,
} from '../licencias/verificar';
import { useSync } from '../store/sync';

export interface ResumenSync {
  enviadas: number;
  aplicadas: number;
  rechazadas: number;
  cambios: number;
  servidorTiempo: string;
}

async function leerUltimaSync(db: SQLiteDatabase): Promise<string | null> {
  const fila = await db.getFirstAsync<{ ultima_sync: string | null }>(
    `SELECT ultima_sync FROM sync_meta WHERE entidad = 'pull'`
  );
  return fila?.ultima_sync ?? null;
}

async function guardarUltimaSync(db: SQLiteDatabase, fecha: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (entidad, ultima_sync) VALUES ('pull', ?)
     ON CONFLICT(entidad) DO UPDATE SET ultima_sync = excluded.ultima_sync`,
    fecha
  );
}

async function aplicarCategoria(db: SQLiteDatabase, cambio: CambioSync): Promise<void> {
  const data = cambio.data as {
    id: string;
    nombre: string;
    color: string;
    orden: number;
    activo: boolean;
    version: number;
    deletedAt: string | null;
  };
  const contexto = await obtenerContextoLocal(db);

  await db.runAsync(
    `INSERT INTO categorias
       (uuid, empresa_id, nombre, color, orden, activo, version, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET
       nombre = excluded.nombre,
       color = excluded.color,
       orden = excluded.orden,
       activo = excluded.activo,
       version = excluded.version,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at
     WHERE excluded.version >= categorias.version`,
    data.id,
    contexto.empresaId,
    data.nombre,
    data.color,
    data.orden,
    data.activo ? 1 : 0,
    data.version,
    cambio.updatedAt,
    data.deletedAt
  );
}

async function aplicarProducto(db: SQLiteDatabase, cambio: CambioSync): Promise<void> {
  const data = cambio.data as {
    id: string;
    categoriaId: string | null;
    nombre: string;
    precio: number;
    emoji: string;
    color: string;
    imagen: string | null;
    orden: number;
    activo: boolean;
    stock: number;
    stockMinimo: number;
    version: number;
    deletedAt: string | null;
  };
  const contexto = await obtenerContextoLocal(db);
  const categoria = data.categoriaId
    ? await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categorias WHERE uuid = ?`,
        data.categoriaId
      )
    : null;

  await db.runAsync(
    `INSERT INTO productos
       (uuid, empresa_id, categoria_id, nombre, precio, emoji, color, imagen,
        orden, activo, stock, stock_minimo, version, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET
       categoria_id = excluded.categoria_id,
       nombre = excluded.nombre,
       precio = excluded.precio,
       emoji = excluded.emoji,
       color = excluded.color,
       imagen = excluded.imagen,
       orden = excluded.orden,
       activo = excluded.activo,
       stock = excluded.stock,
       stock_minimo = excluded.stock_minimo,
       version = excluded.version,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at
     WHERE excluded.version >= productos.version`,
    data.id,
    contexto.empresaId,
    categoria?.id ?? null,
    data.nombre,
    data.precio,
    data.emoji,
    data.color,
    data.imagen,
    data.orden,
    data.activo ? 1 : 0,
    data.stock,
    data.stockMinimo,
    data.version,
    cambio.updatedAt,
    data.deletedAt
  );
}

async function aplicarUsuario(db: SQLiteDatabase, cambio: CambioSync): Promise<void> {
  const data = cambio.data as {
    id: string;
    nombre: string;
    usuario: string;
    rol: string;
    activo: boolean;
    version: number;
    deletedAt: string | null;
  };

  try {
    await db.runAsync(
      `UPDATE usuarios SET
         nombre = ?,
         usuario = ?,
         rol = ?,
         activo = ?,
         version = ?,
         updated_at = ?,
         deleted_at = ?
       WHERE uuid = ? AND ? >= version`,
      data.nombre,
      data.usuario,
      data.rol === 'dependiente' ? 'dependiente' : 'admin',
      data.activo ? 1 : 0,
      data.version,
      cambio.updatedAt,
      data.deletedAt,
      data.id,
      data.version
    );
  } catch {
    // Si el nombre de usuario choca con otro usuario local, se conserva el local.
  }
}

async function aplicarSetting(db: SQLiteDatabase, cambio: CambioSync): Promise<void> {
  const data = cambio.data as { clave: string; valor: string; version: number };
  await db.runAsync(
    `INSERT INTO settings (clave, valor, version, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET
       valor = excluded.valor,
       version = excluded.version,
       updated_at = excluded.updated_at
     WHERE excluded.version >= settings.version`,
    data.clave,
    String(data.valor ?? ''),
    data.version,
    cambio.updatedAt
  );
}

async function aplicarCambios(db: SQLiteDatabase, cambios: CambioSync[]): Promise<void> {
  const porTipo = new Map<string, CambioSync[]>();
  for (const cambio of cambios) {
    const lista = porTipo.get(cambio.tipo) ?? [];
    lista.push(cambio);
    porTipo.set(cambio.tipo, lista);
  }

  // Las categorías deben existir antes de asociar productos que las referencian.
  for (const tipo of ['categoria', 'producto', 'usuario', 'setting']) {
    for (const cambio of porTipo.get(tipo) ?? []) {
      switch (tipo) {
        case 'categoria':
          await aplicarCategoria(db, cambio);
          break;
        case 'producto':
          await aplicarProducto(db, cambio);
          break;
        case 'usuario':
          await aplicarUsuario(db, cambio);
          break;
        case 'setting':
          await aplicarSetting(db, cambio);
          break;
      }
    }
  }
}

async function guardarLicenciaRemota(
  db: SQLiteDatabase,
  token: string | null
): Promise<void> {
  if (!token) return;
  const actual = await leerSetting(db, CLAVE_LICENCIA_TOKEN);
  if (actual !== token) {
    await guardarSetting(db, CLAVE_LICENCIA_TOKEN, token);
  }

  const { empresaId, deviceId } = await leerIdsServidor(db);
  const resultado = evaluarTokenLicencia(token, { empresaId, deviceId });
  await guardarLicenciaLocal(db, resultado);
  useSync.setState({ licencia: resultado });
}

export async function refrescarEstadoSync(db: SQLiteDatabase): Promise<void> {
  try {
    const [pendientes, fallidas, ultima, licencia] = await Promise.all([
      contarOutboxPendientes(db),
      contarOutboxFallidas(db),
      leerSetting(db, CLAVE_ULTIMO_SYNC),
      verificarLicenciaLocal(db),
    ]);
    useSync.setState({
      pendientes,
      fallidas,
      ultimaSync: ultima,
      licencia,
    });
  } catch {
    // El estado de sync nunca debe impedir usar la caja.
  }
}

export async function sincronizar(db: SQLiteDatabase): Promise<ResumenSync> {
  if (useSync.getState().sincronizando) {
    throw new ErrorApi('SYNC_EN_CURSO', 'Ya hay una sincronización en curso.', 409);
  }

  const token = await leerTokenDispositivo(db);
  const { deviceId } = await leerIdsServidor(db);
  if (!token || !deviceId) {
    throw new ErrorApi(
      'SIN_ACTIVACION',
      'Activa este dispositivo para sincronizar con la nube.',
      401
    );
  }

  useSync.setState({ sincronizando: true, error: null });

  try {
    // Primer empuje: una instalación que se activa con datos previos (o que
    // usó la app antes de que existiera la sync) debe subir su foto inicial
    // (usuarios/categorías/productos/settings) antes que turnos y ventas,
    // que en el servidor dependen de esos registros por llave foránea.
    await encolarSnapshotInicial(db);

    const pendientes = await listarOutboxPendientes(db, 50);
    const operaciones: OperacionSync[] = pendientes.map((fila) => {
      const timestamp = Date.parse(fila.created_at);
      return {
        operationId: fila.operation_id,
        tipo: fila.tipo,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        payload: JSON.parse(fila.payload) as unknown,
      };
    });

    let aplicadas = 0;
    let rechazadas = 0;

    if (operaciones.length > 0) {
      const respuesta = await pushOperaciones(db, deviceId, operaciones);
      const resultados = new Map(
        respuesta.results.map((resultado) => [resultado.operationId, resultado])
      );

      for (const fila of pendientes) {
        const resultado = resultados.get(fila.operation_id);
        if (!resultado) {
          await marcarOutboxFallida(db, fila.operation_id, 'SIN_RESPUESTA_DEL_SERVIDOR');
          continue;
        }

        if (resultado.estado === 'aplicada') {
          aplicadas += 1;
          if (fila.tipo === 'venta') {
            const payload = JSON.parse(fila.payload) as { localId?: string };
            const datos = resultado.resultado as
              | { ventaId?: string; numero?: number }
              | undefined;
            if (payload.localId && datos?.ventaId) {
              await db.runAsync(
                `UPDATE ventas SET servidor_id = ?, numero_servidor = ? WHERE uuid = ?`,
                datos.ventaId,
                datos.numero ?? null,
                payload.localId
              );
            }
          }
          await eliminarOutbox(db, fila.operation_id);
        } else {
          rechazadas += 1;
          await marcarOutboxRechazada(
            db,
            fila.operation_id,
            resultado.error ?? 'OPERACION_RECHAZADA'
          );
        }
      }
    }

    const since = await leerUltimaSync(db);
    const pull = await pullCambios(db, deviceId, since ?? undefined);
    await aplicarCambios(db, pull.cambios);

    if (pull.cambios.length > 0) {
      const ultimo = pull.cambios.reduce(
        (maximo, cambio) => (cambio.updatedAt > maximo ? cambio.updatedAt : maximo),
        since ?? ''
      );
      if (ultimo) await guardarUltimaSync(db, ultimo);
    }

    await guardarLicenciaRemota(db, pull.licencia?.token ?? null);
    await guardarSetting(db, CLAVE_ULTIMO_SYNC, ahoraIso());
    await refrescarEstadoSync(db);

    return {
      enviadas: operaciones.length,
      aplicadas,
      rechazadas,
      cambios: pull.cambios.length,
      servidorTiempo: pull.serverTime,
    };
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : 'No se pudo sincronizar con la nube.';
    useSync.setState({ error: mensaje });
    throw error;
  } finally {
    useSync.setState({ sincronizando: false });
  }
}

export async function sincronizarSilencioso(db: SQLiteDatabase): Promise<void> {
  try {
    await sincronizar(db);
  } catch {
    // El siguiente intento automático o manual reintentará.
  }
}

/**
 * Reencola las operaciones que el servidor rechazó y sincroniza enseguida.
 * Útil cuando el rechazo era transitorio (p. ej. una venta cuya dependencia
 * aún no se había subido); si el rechazo es permanente, volverá a marcarse
 * como fallida y seguirá visible en la interfaz.
 */
export async function reintentarRechazadas(db: SQLiteDatabase): Promise<ResumenSync> {
  await reencolarRechazadas(db);
  return sincronizar(db);
}
