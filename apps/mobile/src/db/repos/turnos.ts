import type { SQLiteDatabase } from 'expo-sqlite';
import { CLAVE_DISPOSITIVO_SERVIDOR, leerSetting } from '../../api/config';
import type { FormaPago, TurnoCaja } from '../../types';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import { encolarTurnoApertura, encolarTurnoCierre } from '../sync/encolar';

interface FilaTurno {
  id: number;
  uuid: string | null;
  usuario_id: number;
  apertura: string;
  cierre: string | null;
  fondo_inicial: number;
  efectivo_esperado: number;
  observacion_diferencia: string | null;
  ventas_count: number;
  total_esperado: number;
  desglose_json: string;
  dinero_real: number | null;
  diferencia: number | null;
  estado: string;
}

const A_TURNO = (f: FilaTurno): TurnoCaja => ({
  id: f.id,
  uuid: f.uuid ?? undefined,
  usuarioId: f.usuario_id,
  apertura: f.apertura,
  cierre: f.cierre,
  fondoInicial: f.fondo_inicial ?? 0,
  efectivoEsperado: f.efectivo_esperado ?? 0,
  observacionDiferencia: f.observacion_diferencia,
  ventasCount: f.ventas_count,
  totalEsperado: f.total_esperado,
  desglose: JSON.parse(f.desglose_json) as Partial<Record<FormaPago, number>>,
  dineroReal: f.dinero_real,
  diferencia: f.diferencia,
  estado: f.estado === 'abierto' ? 'abierto' : 'cerrado',
});

/**
 * Identificadores con los que la SQLite local puede haber marcado un turno
 * propio: el id del dispositivo local (turnos abiertos en esta instalación) y
 * el id del dispositivo en el servidor (turnos que llegaron por el pull).
 * Un turno abierto en otra terminal nunca debe usarse para vender aquí: el
 * servidor lo rechaza y el cierre de esa caja descuadraría.
 */
async function dispositivosPropios(db: SQLiteDatabase): Promise<[string, string]> {
  const contexto = await obtenerContextoLocal(db);
  const servidor = (await leerSetting(db, CLAVE_DISPOSITIVO_SERVIDOR)) ?? '';
  return [contexto.deviceId, servidor];
}

export async function turnoAbiertoOCrear(
  db: SQLiteDatabase,
  usuarioId: number,
  ahora: Date,
  fondoInicial = 0
): Promise<number | null> {
  let turnoId: number | null = null;
  const contexto = await obtenerContextoLocal(db);

  await db.withTransactionAsync(async () => {
    const [dispositivoLocal, dispositivoServidor] = await dispositivosPropios(db);
    const fila = await db.getFirstAsync<FilaTurno>(
      `SELECT * FROM turnos_caja
       WHERE empresa_id = ? AND estado = 'abierto' AND usuario_id = ?
         AND device_id IN (?, ?)
       ORDER BY id DESC LIMIT 1`,
      contexto.empresaId,
      usuarioId,
      dispositivoLocal,
      dispositivoServidor
    );
    if (fila) {
      turnoId = fila.id;
      return;
    }

    const res = await db.runAsync(
       `INSERT INTO turnos_caja
          (uuid, empresa_id, device_id, usuario_id, apertura, fondo_inicial, estado, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'abierto', ?)`,
      nuevoUuid(),
      contexto.empresaId,
      contexto.deviceId,
      usuarioId,
      ahora.toISOString(),
      fondoInicial,
      ahoraIso()
    );
    turnoId = res.lastInsertRowId;
    await encolarTurnoApertura(db, turnoId);
  });

  return turnoId;
}

export async function turnoAbierto(
  db: SQLiteDatabase,
  usuarioId: number
): Promise<TurnoCaja | null> {
  const [dispositivoLocal, dispositivoServidor] = await dispositivosPropios(db);
  const contexto = await obtenerContextoLocal(db);
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT * FROM turnos_caja
     WHERE empresa_id = ? AND estado = 'abierto' AND usuario_id = ?
       AND device_id IN (?, ?)
     ORDER BY id DESC LIMIT 1`,
    contexto.empresaId,
    usuarioId,
    dispositivoLocal,
    dispositivoServidor
  );
  return fila ? A_TURNO(fila) : null;
}

export interface DatosCierre {
  cantidadVentas: number;
  totalVendido: number;
  efectivoEsperado: number;
  desglose: Record<string, number>;
}

export async function cerrarTurno(
  db: SQLiteDatabase,
  turnoId: number,
  dineroReal: number,
  cierre: string,
  datos: DatosCierre,
  observacion: string | null = null
): Promise<TurnoCaja | null> {
  let resultado: TurnoCaja | null = null;

  const contexto = await obtenerContextoLocal(db);
  await db.withTransactionAsync(async () => {
    const fila = await db.getFirstAsync<FilaTurno>(
      `SELECT * FROM turnos_caja WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      turnoId
    );
    if (!fila || fila.estado !== 'abierto') {
      return;
    }

    const diferencia = dineroReal - datos.efectivoEsperado;

    await db.runAsync(
      `UPDATE turnos_caja
       SET cierre = ?, ventas_count = ?, total_esperado = ?, desglose_json = ?,
           dinero_real = ?, diferencia = ?, efectivo_esperado = ?,
           observacion_diferencia = ?, estado = 'cerrado', updated_at = ?
        WHERE empresa_id = ? AND id = ? AND estado = 'abierto'`,
      cierre,
      datos.cantidadVentas,
      datos.totalVendido,
      JSON.stringify(datos.desglose),
      dineroReal,
      diferencia,
      datos.efectivoEsperado,
      observacion,
      ahoraIso(),
      contexto.empresaId,
      turnoId
    );

    await encolarTurnoCierre(db, turnoId);

    resultado = A_TURNO({
      ...fila,
      cierre,
      ventas_count: datos.cantidadVentas,
      total_esperado: datos.totalVendido,
      desglose_json: JSON.stringify(datos.desglose),
      dinero_real: dineroReal,
      diferencia,
      efectivo_esperado: datos.efectivoEsperado,
      observacion_diferencia: observacion,
      estado: 'cerrado',
    });
  });

  return resultado;
}

export async function listarTurnos(
  db: SQLiteDatabase,
  limite = 50
): Promise<TurnoCaja[]> {
  const contexto = await obtenerContextoLocal(db);
  const filas = await db.getAllAsync<FilaTurno>(
    `SELECT * FROM turnos_caja WHERE empresa_id = ? ORDER BY id DESC LIMIT ?`,
    contexto.empresaId,
    limite
  );
  return filas.map(A_TURNO);
}
