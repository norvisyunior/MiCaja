import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ErrorApi,
  pullCambios,
  pushOperaciones,
  type CambioSync,
  type OperacionSync,
} from '../api/cliente';
import {
  CLAVE_DISPOSITIVO_SERVIDOR,
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
import { turnoAbiertoOCrear } from '../db/repos/turnos';
import {
  SETTINGS_SINCRONIZABLES,
  encolarPinHashesPendientes,
  encolarSnapshotInicial,
} from '../db/sync/encolar';
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

/**
 * Cursor del pull. Es opaco para la app: un JSON que guarda, por tabla, el
 * `updated_at` exacto de Postgres y el último id entregado. Se persiste como
 * texto en `sync_meta` para reanudar sin repetir ni saltarse filas.
 */
async function leerCursorPull(db: SQLiteDatabase): Promise<string | null> {
  const fila = await db.getFirstAsync<{ ultima_sync: string | null }>(
    `SELECT ultima_sync FROM sync_meta WHERE entidad = 'pull'`
  );
  const guardado = fila?.ultima_sync ?? null;
  // Un cursor guardado por una versión anterior era una fecha ISO; se ignora
  // para que el servidor devuelva el negocio completo y emita uno nuevo.
  if (!guardado || !guardado.startsWith('{')) return null;
  return guardado;
}

async function guardarCursorPull(
  db: SQLiteDatabase,
  cursor: string | null
): Promise<void> {
  if (!cursor) return;
  await db.runAsync(
    `INSERT INTO sync_meta (entidad, ultima_sync) VALUES ('pull', ?)
     ON CONFLICT(entidad) DO UPDATE SET ultima_sync = excluded.ultima_sync`,
    cursor
  );
}

/** Clave local (no sincronizable) con los cambios que esperan dependencia. */
const CLAVE_APLAZADOS = 'sync_aplazados';

async function leerAplazados(db: SQLiteDatabase): Promise<CambioSync[]> {
  const crudo = await leerSetting(db, CLAVE_APLAZADOS);
  if (!crudo) return [];
  try {
    const lista = JSON.parse(crudo) as unknown;
    return Array.isArray(lista) ? (lista as CambioSync[]) : [];
  } catch {
    return [];
  }
}

async function guardarAplazados(
  db: SQLiteDatabase,
  cambios: CambioSync[]
): Promise<void> {
  if (cambios.length === 0) {
    await db.runAsync(`DELETE FROM settings WHERE clave = ?`, CLAVE_APLAZADOS);
    return;
  }
  await guardarSetting(db, CLAVE_APLAZADOS, JSON.stringify(cambios));
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
  const contexto = await obtenerContextoLocal(db);

  try {
    // Upsert completo: usuarios creados en otro dispositivo (p. ej. una
    // invitación aceptada en la caja del dueño) deben aparecer también aquí.
    await db.runAsync(
      `INSERT INTO usuarios
         (uuid, empresa_id, nombre, usuario, pin, rol, activo, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?)
       ON CONFLICT(uuid) DO UPDATE SET
         nombre = excluded.nombre,
         usuario = excluded.usuario,
         rol = excluded.rol,
         activo = excluded.activo,
         version = excluded.version,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at
       WHERE excluded.version >= usuarios.version`,
      data.id,
      contexto.empresaId,
      data.nombre,
      data.usuario,
      data.rol === 'dependiente' ? 'dependiente' : 'admin',
      data.activo ? 1 : 0,
      data.version,
      cambio.updatedAt,
      data.deletedAt
    );
  } catch {
    // Si el nombre de usuario choca con otro usuario local, se conserva el local.
  }
}

async function aplicarTurno(db: SQLiteDatabase, cambio: CambioSync): Promise<boolean> {
  const data = cambio.data as {
    id: string;
    dispositivoId: string;
    usuarioId: string;
    apertura: string;
    cierre: string | null;
    estado: string;
    ventasCount: number;
    totalEsperado: number;
    desglose: Record<string, number>;
    dineroReal: number | null;
    diferencia: number | null;
  };
  const usuario = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM usuarios WHERE uuid = ?`,
    data.usuarioId
  );
  // Sin el usuario local no se puede respetar la llave foránea; se aplaza y se
  // reintenta cuando la cuenta llegue en otra página del pull.
  if (!usuario) return false;

  const contexto = await obtenerContextoLocal(db);
  await db.runAsync(
    `INSERT INTO turnos_caja
       (uuid, empresa_id, device_id, usuario_id, apertura, cierre, ventas_count,
        total_esperado, desglose_json, dinero_real, diferencia, estado, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET
       usuario_id = excluded.usuario_id,
       apertura = excluded.apertura,
       cierre = excluded.cierre,
       ventas_count = excluded.ventas_count,
       total_esperado = excluded.total_esperado,
       desglose_json = excluded.desglose_json,
       dinero_real = excluded.dinero_real,
       diferencia = excluded.diferencia,
       estado = excluded.estado,
       updated_at = excluded.updated_at`,
    data.id,
    contexto.empresaId,
    data.dispositivoId,
    usuario.id,
    data.apertura,
    data.cierre,
    data.ventasCount,
    data.totalEsperado,
    JSON.stringify(data.desglose ?? {}),
    data.dineroReal,
    data.diferencia,
    data.estado === 'abierto' ? 'abierto' : 'cerrado',
    cambio.updatedAt
  );
  return true;
}

interface VentaSyncData {
  id: string;
  localId: string;
  dispositivoId: string;
  usuarioId: string;
  turnoId: string | null;
  numero: number;
  fechaCliente: string;
  subtotal: number;
  descuentoPct: number;
  total: number;
  formaPago: string;
  montoEfectivo: number;
  montoDigital: number;
  anulada: boolean;
  motivoAnulacion: string | null;
  anuladaPor: string | null;
  anuladaEn: string | null;
  items: Array<{
    id: string;
    productoId: string | null;
    nombre: string;
    precioUnitario: number;
    cantidad: number;
    subtotal: number;
  }>;
}

async function aplicarVenta(db: SQLiteDatabase, cambio: CambioSync): Promise<boolean> {
  const data = cambio.data as unknown as VentaSyncData;
  const usuario = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM usuarios WHERE uuid = ?`,
    data.usuarioId
  );
  if (!usuario) return false;

  const turno = data.turnoId
    ? await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM turnos_caja WHERE uuid = ?`,
        data.turnoId
      )
    : null;
  // La venta referencia un turno que aún no llegó: se aplaza para que el
  // historial quede enlazado al arqueo correcto en vez de perder el vínculo.
  if (data.turnoId && !turno) return false;
  const anuladaPor = data.anuladaPor
    ? await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM usuarios WHERE uuid = ?`,
        data.anuladaPor
      )
    : null;

  // Una venta creada en este dispositivo ya existe con su uuid local; el
  // servidor la devuelve con `localId` y su id propio. Se busca por ambos para
  // no duplicar el historial cuando el push y el pull coinciden.
  const existente = await db.getFirstAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM ventas
     WHERE uuid = ? OR uuid = ? OR servidor_id = ?
     LIMIT 1`,
    data.localId,
    data.id,
    data.id
  );

  const contexto = await obtenerContextoLocal(db);
  let ventaId = 0;

  if (existente) {
    ventaId = existente.id;
    await db.runAsync(
      `UPDATE ventas SET
         servidor_id = ?, numero_servidor = ?, turno_id = ?, usuario_id = ?,
         fecha_iso = ?, subtotal = ?, descuento_pct = ?, total = ?,
         forma_pago = ?, monto_efectivo = ?, monto_digital = ?,
         anulada = ?, motivo_anulacion = ?, anulada_por = ?, anulada_en = ?,
         device_id = ?, updated_at = ?
       WHERE id = ?`,
      data.id,
      data.numero,
      turno?.id ?? null,
      usuario.id,
      data.fechaCliente,
      data.subtotal,
      data.descuentoPct,
      data.total,
      data.formaPago,
      data.montoEfectivo,
      data.montoDigital,
      data.anulada ? 1 : 0,
      data.motivoAnulacion,
      anuladaPor?.id ?? null,
      data.anuladaEn,
      data.dispositivoId,
      cambio.updatedAt,
      ventaId
    );
  } else {
    const creada = await db.runAsync(
      `INSERT INTO ventas
         (uuid, empresa_id, device_id, numero, turno_id, usuario_id, fecha_iso,
          subtotal, descuento_pct, total, forma_pago, monto_efectivo, monto_digital,
          anulada, motivo_anulacion, anulada_por, anulada_en, servidor_id,
          numero_servidor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.localId ?? data.id,
      contexto.empresaId,
      data.dispositivoId,
      data.numero,
      turno?.id ?? null,
      usuario.id,
      data.fechaCliente,
      data.subtotal,
      data.descuentoPct,
      data.total,
      data.formaPago,
      data.montoEfectivo,
      data.montoDigital,
      data.anulada ? 1 : 0,
      data.motivoAnulacion,
      anuladaPor?.id ?? null,
      data.anuladaEn,
      data.id,
      data.numero,
      cambio.updatedAt
    );
    ventaId = creada.lastInsertRowId;
  }

  await db.runAsync(`DELETE FROM venta_items WHERE venta_id = ?`, ventaId);
  for (const item of data.items) {
    const producto = item.productoId
      ? await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM productos WHERE uuid = ?`,
          item.productoId
        )
      : null;
    await db.runAsync(
      `INSERT INTO venta_items
         (uuid, empresa_id, venta_id, producto_id, nombre, precio_unitario,
          cantidad, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      contexto.empresaId,
      ventaId,
      producto?.id ?? null,
      item.nombre,
      item.precioUnitario,
      item.cantidad,
      item.subtotal
    );
  }

  return true;
}

async function aplicarSetting(db: SQLiteDatabase, cambio: CambioSync): Promise<void> {
  const data = cambio.data as { clave: string; valor: string; version: number };
  // Solo claves de negocio; claves internas (device_token, licencias, etc.)
  // se administran localmente y el servidor no debe pisarlas.
  if (!SETTINGS_SINCRONIZABLES.has(data.clave)) return;
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

async function aplicarCambios(
  db: SQLiteDatabase,
  cambios: CambioSync[]
): Promise<CambioSync[]> {
  const porTipo = new Map<string, CambioSync[]>();
  for (const cambio of cambios) {
    const lista = porTipo.get(cambio.tipo) ?? [];
    lista.push(cambio);
    porTipo.set(cambio.tipo, lista);
  }

  // Los cambios cuya dependencia local todavía no existe (usuario o turno)
  // se devuelven para reintentarlos al aplicar la siguiente página.
  const aplazados: CambioSync[] = [];

  // El orden respeta las llaves foráneas locales: usuarios y categorías
  // primero, luego productos, turnos y ventas (que referencian a los
  // anteriores). Una página entera se aplica en una transacción para que un
  // error no deje el historial a medias.
  await db.withTransactionAsync(async () => {
    for (const cambio of porTipo.get('usuario') ?? []) {
      await aplicarUsuario(db, cambio);
    }
    for (const cambio of porTipo.get('categoria') ?? []) {
      await aplicarCategoria(db, cambio);
    }
    for (const cambio of porTipo.get('producto') ?? []) {
      await aplicarProducto(db, cambio);
    }
    for (const cambio of porTipo.get('turno') ?? []) {
      if (!(await aplicarTurno(db, cambio))) aplazados.push(cambio);
    }
    for (const cambio of porTipo.get('venta') ?? []) {
      if (!(await aplicarVenta(db, cambio))) aplazados.push(cambio);
    }
    for (const cambio of porTipo.get('setting') ?? []) {
      await aplicarSetting(db, cambio);
    }
  });

  return aplazados;
}

/**
 * El servidor comunicó que la licencia (o el dispositivo) ya no es operativa.
 * Se marca la licencia local como inválida para que el bloqueo operativo
 * entre en acción hasta que el dispositivo se re-active o se re-negocie.
 */
async function invalidarLicenciaLocal(db: SQLiteDatabase): Promise<void> {
  try {
    await db.runAsync(
      `UPDATE licencia_local SET estado = 'invalida', ultima_verificacion = ?`,
      ahoraIso()
    );
    useSync.setState({
      licencia: {
        estado: 'invalida',
        valida: false,
        enGracia: false,
        motivo: 'estado',
      },
    });
  } catch {
    // Nunca romper la sincronización por esto; el bloqueo se recalcula igual.
  }
}

async function guardarLicenciaRemota(
  db: SQLiteDatabase,
  licencia: { estado: string; token: string | null } | null
): Promise<void> {
  if (!licencia) return;

  if (licencia.token) {
    const actual = await leerSetting(db, CLAVE_LICENCIA_TOKEN);
    if (actual !== licencia.token) {
      await guardarSetting(db, CLAVE_LICENCIA_TOKEN, licencia.token);
    }

    const { empresaId, deviceId } = await leerIdsServidor(db);
    const resultado = evaluarTokenLicencia(licencia.token, { empresaId, deviceId });
    await guardarLicenciaLocal(db, resultado);
    useSync.setState({ licencia: resultado });
    return;
  }

  // Sin token pero con estado: suspensión, vencimiento o cancelación.
  if (
    ['suspendida', 'vencida', 'cancelada'].includes(licencia.estado)
  ) {
    await invalidarLicenciaLocal(db);
  }
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
    await encolarPinHashesPendientes(db);

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

    // El servidor pagina el pull por tabla. Se recorre hasta terminar para que
    // una instalación nueva o un cambio de negocio cargue TODO el catálogo y el
    // historial, no solo la primera página. El cursor es opaco y avanzar sin
    // repetirse es responsabilidad del servidor; el tope solo evita un bucle
    // infinito ante un fallo grave.
    let cursor = await leerCursorPull(db);
    let hayMas = true;
    let vueltas = 0;
    let cambios = 0;
    let servidorTiempo = '';
    // Cambios que no pudieron aplicarse por una dependencia (usuario o turno)
    // todavía ausente. Se persisten para reintentarlos en la próxima sync.
    let aplazados: CambioSync[] = await leerAplazados(db);
    const MAX_PAGINAS = 50;

    while (hayMas && vueltas < MAX_PAGINAS) {
      const pull = await pullCambios(db, deviceId, cursor);

      // Primero los cambios de esta página y después los que quedaron
      // aplazados por una dependencia que ya pudo llegar.
      aplazados = await aplicarCambios(db, [...pull.cambios, ...aplazados]);

      cambios += pull.cambios.length;
      servidorTiempo = pull.serverTime;

      const anterior = cursor;
      if (pull.cursor) {
        cursor = pull.cursor;
        await guardarCursorPull(db, pull.cursor);
      }

      await guardarLicenciaRemota(db, pull.licencia);

      hayMas = pull.hayMas === true;
      vueltas += 1;
      // Si el servidor dice que hay más pero no movió el cursor, seguir
      // pediría la misma página para siempre.
      if (hayMas && (!pull.cursor || pull.cursor === anterior)) break;
    }

    // Último intento para los aplazados, por si su dependencia llegó en la
    // misma página final.
    if (aplazados.length > 0) {
      aplazados = await aplicarCambios(db, aplazados);
    }
    await guardarAplazados(db, aplazados);

    await guardarSetting(db, CLAVE_ULTIMO_SYNC, ahoraIso());
    await refrescarEstadoSync(db);

    return {
      enviadas: operaciones.length,
      aplicadas,
      rechazadas,
      cambios,
      servidorTiempo,
    };
  } catch (error) {
    // El servidor negó la operación porque la licencia o el dispositivo ya
    // no están vigentes: se refleja en el estado local para bloquear la caja.
    if (
      error instanceof ErrorApi &&
      [
        'LICENCIA_SUSPENDIDA',
        'LICENCIA_VENCIDA',
        'LICENCIA_NO_ENCONTRADA',
        'DISPOSITIVO_INACTIVO',
      ].includes(error.codigo)
    ) {
      await invalidarLicenciaLocal(db);
    }
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
 * Antes de reintentar, repara las ventas que el servidor rechazó por pertenecer
 * a un turno de otra terminal (`TURNO_OTRO_DISPOSITIVO`). Esas ventas sí se
 * registraron en esta caja: se reasignan al turno abierto de este dispositivo
 * (se crea si hace falta) y se actualiza también la fila local para que los
 * totales del turno cuadren. Sin esto, reintentar devolvería el mismo rechazo
 * para siempre.
 */
async function repararVentasDeOtraTerminal(db: SQLiteDatabase): Promise<void> {
  const contexto = await obtenerContextoLocal(db);
  const servidor = (await leerSetting(db, CLAVE_DISPOSITIVO_SERVIDOR)) ?? '';
  const propios = [contexto.deviceId, servidor];

  const fallidas = await db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM sync_outbox WHERE estado = 'fallida' AND tipo = 'venta'`
  );

  for (const fila of fallidas) {
    let datos: { localId?: string; usuarioId?: string; turnoId?: string | null };
    try {
      datos = JSON.parse(fila.payload) as typeof datos;
    } catch {
      continue;
    }
    if (!datos.turnoId) continue;

    const turno = await db.getFirstAsync<{
      id: number;
      estado: string;
      device_id: string;
    }>(`SELECT id, estado, device_id FROM turnos_caja WHERE uuid = ?`, datos.turnoId);

    // El turno ya es de esta terminal y sigue abierto: no hay nada que reparar.
    if (turno && propios.includes(turno.device_id) && turno.estado === 'abierto') {
      continue;
    }

    const usuario = datos.usuarioId
      ? await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM usuarios WHERE uuid = ?`,
          datos.usuarioId
        )
      : null;

    let nuevoTurno: { id: number; uuid: string | null } | null = null;
    if (usuario) {
      const turnoId = await turnoAbiertoOCrear(db, usuario.id, new Date());
      if (turnoId) {
        nuevoTurno = await db.getFirstAsync<{ id: number; uuid: string | null }>(
          `SELECT id, uuid FROM turnos_caja WHERE id = ?`,
          turnoId
        );
      }
    }

    datos.turnoId = nuevoTurno?.uuid ?? null;
    await db.runAsync(
      `UPDATE sync_outbox SET payload = ? WHERE id = ?`,
      JSON.stringify(datos),
      fila.id
    );

    if (nuevoTurno && datos.localId) {
      await db.runAsync(
        `UPDATE ventas SET turno_id = ? WHERE uuid = ?`,
        nuevoTurno.id,
        datos.localId
      );
    }
  }
}

/**
 * Reencola las operaciones que el servidor rechazó y sincroniza enseguida.
 * Útil cuando el rechazo era transitorio (p. ej. una venta cuya dependencia
 * aún no se había subido); si el rechazo es permanente, volverá a marcarse
 * como fallida y seguirá visible en la interfaz.
 */
export async function reintentarRechazadas(db: SQLiteDatabase): Promise<ResumenSync> {
  await repararVentasDeOtraTerminal(db);
  await reencolarRechazadas(db);
  return sincronizar(db);
}
