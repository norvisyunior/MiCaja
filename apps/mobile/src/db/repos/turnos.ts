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
  ahora: Date
): Promise<number | null> {
  let turnoId: number | null = null;

  await db.withTransactionAsync(async () => {
    const [dispositivoLocal, dispositivoServidor] = await dispositivosPropios(db);
    const fila = await db.getFirstAsync<FilaTurno>(
      `SELECT * FROM turnos_caja
       WHERE estado = 'abierto' AND usuario_id = ?
         AND device_id IN (?, ?)
       ORDER BY id DESC LIMIT 1`,
      usuarioId,
      dispositivoLocal,
      dispositivoServidor
    );
    if (fila) {
      turnoId = fila.id;
      return;
    }

    const contexto = await obtenerContextoLocal(db);
    const res = await db.runAsync(
      `INSERT INTO turnos_caja
         (uuid, empresa_id, device_id, usuario_id, apertura, estado, updated_at)
       VALUES (?, ?, ?, ?, ?, 'abierto', ?)`,
      nuevoUuid(),
      contexto.empresaId,
      contexto.deviceId,
      usuarioId,
      ahora.toISOString(),
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
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT * FROM turnos_caja
     WHERE estado = 'abierto' AND usuario_id = ?
       AND device_id IN (?, ?)
     ORDER BY id DESC LIMIT 1`,
    usuarioId,
    dispositivoLocal,
    dispositivoServidor
  );
  return fila ? A_TURNO(fila) : null;
}

export async function cerrarTurno(
  db: SQLiteDatabase,
  turnoId: number,
  dineroReal: number,
  cierre: string
): Promise<TurnoCaja | null> {
  let resultado: TurnoCaja | null = null;

  await db.withTransactionAsync(async () => {
    const fila = await db.getFirstAsync<FilaTurno>(
      `SELECT * FROM turnos_caja WHERE id = ?`,
      turnoId
    );
    if (!fila || fila.estado !== 'abierto') {
      return;
    }

    const resumen = await db.getFirstAsync<{
      ventas: number;
      total: number;
    }>(
      `SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS total
       FROM ventas WHERE turno_id = ? AND anulada = 0`,
      turnoId
    );

    const formas = await db.getAllAsync<{
      forma_pago: string;
      total: number;
      efectivo: number;
      digital: number;
    }>(
      `SELECT forma_pago,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(monto_efectivo), 0) AS efectivo,
              COALESCE(SUM(monto_digital), 0) AS digital
       FROM ventas WHERE turno_id = ? AND anulada = 0
       GROUP BY forma_pago`,
      turnoId
    );

    const desglose: Record<string, number> = {};
    let totalEfectivo = 0;
    let totalDigital = 0;
    for (const f of formas) {
      desglose[f.forma_pago] = f.total;
      totalEfectivo += f.efectivo;
      totalDigital += f.digital;
    }
    desglose['efectivo_total'] = totalEfectivo;
    desglose['digital_total'] = totalDigital;

    const totalEsperado = resumen?.total ?? 0;
    // El arqueo se compara contra el efectivo esperado, no contra el total
    // vendido: el dinero digital no está físicamente en la caja.
    const diferencia = dineroReal - totalEfectivo;

    await db.runAsync(
      `UPDATE turnos_caja
       SET cierre = ?, ventas_count = ?, total_esperado = ?, desglose_json = ?,
           dinero_real = ?, diferencia = ?, estado = 'cerrado', updated_at = ?
       WHERE id = ?`,
      cierre,
      resumen?.ventas ?? 0,
      totalEsperado,
      JSON.stringify(desglose),
      dineroReal,
      diferencia,
      ahoraIso(),
      turnoId
    );

    await encolarTurnoCierre(db, turnoId);

    resultado = A_TURNO({
      ...fila,
      cierre,
      ventas_count: resumen?.ventas ?? 0,
      total_esperado: totalEsperado,
      desglose_json: JSON.stringify(desglose),
      dinero_real: dineroReal,
      diferencia,
      estado: 'cerrado',
    });
  });

  return resultado;
}

export async function listarTurnos(
  db: SQLiteDatabase,
  limite = 50
): Promise<TurnoCaja[]> {
  const filas = await db.getAllAsync<FilaTurno>(
    `SELECT * FROM turnos_caja ORDER BY id DESC LIMIT ?`,
    limite
  );
  return filas.map(A_TURNO);
}
