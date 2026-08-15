import type { SQLiteDatabase } from 'expo-sqlite';
import type { FormaPago, TurnoCaja } from '../../types';

interface FilaTurno {
  id: number;
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

export async function turnoAbiertoOCrear(
  db: SQLiteDatabase,
  usuarioId: number,
  ahora: Date
): Promise<number | null> {
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT * FROM turnos_caja WHERE estado = 'abierto' AND usuario_id = ? ORDER BY id DESC LIMIT 1`,
    usuarioId
  );
  if (fila) {
    return fila.id;
  }

  const res = await db.runAsync(
    `INSERT INTO turnos_caja (usuario_id, apertura, estado) VALUES (?, ?, 'abierto')`,
    usuarioId,
    ahora.toISOString()
  );
  return res.lastInsertRowId;
}

export async function turnoAbierto(
  db: SQLiteDatabase,
  usuarioId: number
): Promise<TurnoCaja | null> {
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT * FROM turnos_caja WHERE estado = 'abierto' AND usuario_id = ? ORDER BY id DESC LIMIT 1`,
    usuarioId
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
    if (!fila) {
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
    const diferencia = dineroReal - totalEsperado;

    await db.runAsync(
      `UPDATE turnos_caja
       SET cierre = ?, ventas_count = ?, total_esperado = ?, desglose_json = ?,
           dinero_real = ?, diferencia = ?, estado = 'cerrado'
       WHERE id = ?`,
      cierre,
      resumen?.ventas ?? 0,
      totalEsperado,
      JSON.stringify(desglose),
      dineroReal,
      diferencia,
      turnoId
    );

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
