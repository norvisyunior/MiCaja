import { describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  cambiarPinPropio,
  desbloquearUsuario,
  establecerCodigoRecuperacion,
  generarCodigoRecuperacionPropio,
  MAX_INTENTOS_PIN,
  recuperarAccesoPorUsuario,
  verificarAcceso,
  verificarAccesoPorUsuario,
} from './acceso';
import { crearPinHash } from '../../utils/pin';
import {
  crearHashCodigoRecuperacion,
  esCodigoRecuperacionValido,
} from '../../utils/recuperacion';

const CODIGO_INICIAL = 'ABCD-EFGH-JKLM';

interface FilaPrueba {
  id: number;
  nombre: string;
  usuario: string;
  rol: string;
  pin: string;
  codigo_recuperacion: string | null;
  activo: number;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  deleted_at: string | null;
}

interface OpcionesUsuario {
  usuario?: string;
  pinPlano?: string;
  pinAlmacenado?: string;
  codigo?: string | null;
  activo?: number;
  intentos?: number;
  bloqueadoHasta?: string | null;
}

async function crearBase(opciones: OpcionesUsuario = {}) {
  const pin = opciones.pinAlmacenado ?? (await crearPinHash(opciones.pinPlano ?? '1234'));
  const codigo = opciones.codigo === undefined ? CODIGO_INICIAL : opciones.codigo;
  const fila: FilaPrueba = {
    id: 1,
    nombre: 'Ana',
    usuario: opciones.usuario ?? 'ana',
    rol: 'admin',
    pin,
    codigo_recuperacion: codigo ? await crearHashCodigoRecuperacion(codigo) : null,
    activo: opciones.activo ?? 1,
    intentos_fallidos: opciones.intentos ?? 0,
    bloqueado_hasta: opciones.bloqueadoHasta ?? null,
    deleted_at: null,
  };

  const db = {
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('WHERE usuario = ?')) {
        if (fila.deleted_at) return null;
        return String(fila.usuario).toLowerCase() === String(params[0]).toLowerCase()
          ? { ...fila }
          : null;
      }
      if (sql.includes('WHERE id = ?')) {
        if (fila.deleted_at || fila.id !== params[0]) return null;
        return { ...fila };
      }
      throw new Error(`Consulta no soportada por la prueba: ${sql}`);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('SET pin = ?, codigo_recuperacion = ?')) {
        fila.pin = String(params[0]);
        fila.codigo_recuperacion = String(params[1]);
        fila.intentos_fallidos = 0;
        fila.bloqueado_hasta = null;
      } else if (sql.includes('SET pin = ?, intentos_fallidos = 0')) {
        fila.pin = String(params[0]);
        fila.intentos_fallidos = 0;
        fila.bloqueado_hasta = null;
      } else if (sql.includes('SET intentos_fallidos = 0, bloqueado_hasta = NULL')) {
        fila.intentos_fallidos = 0;
        fila.bloqueado_hasta = null;
      } else if (sql.includes('SET intentos_fallidos = ?, bloqueado_hasta = ?')) {
        fila.intentos_fallidos = Number(params[0]);
        fila.bloqueado_hasta = String(params[1]);
      } else if (sql.includes('SET intentos_fallidos = ?, bloqueado_hasta = NULL')) {
        fila.intentos_fallidos = Number(params[0]);
        fila.bloqueado_hasta = null;
      } else if (sql.includes('SET codigo_recuperacion = ?')) {
        fila.codigo_recuperacion = String(params[0]);
      } else {
        throw new Error(`Actualización no soportada por la prueba: ${sql}`);
      }
      return { lastInsertRowId: 0, changes: 1 };
    },
  };

  return { db: db as unknown as SQLiteDatabase, fila };
}

describe('verificarAccesoPorUsuario', () => {
  it('acepta el PIN correcto, normaliza el usuario y devuelve la cuenta', async () => {
    const { db, fila } = await crearBase();
    const resultado = await verificarAccesoPorUsuario(db, '  ANA  ', '1234');

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.usuario.nombre).toBe('Ana');
      expect(resultado.usuario.usuario).toBe('ana');
      expect(resultado.usuario.rol).toBe('admin');
    }
    expect(fila.intentos_fallidos).toBe(0);
  });

  it('migra un PIN en texto plano al formato iterado', async () => {
    const { db, fila } = await crearBase({ pinAlmacenado: '1234' });
    const resultado = await verificarAccesoPorUsuario(db, 'ana', '1234');

    expect(resultado.ok).toBe(true);
    expect(fila.pin.startsWith('sha256it$')).toBe(true);
    expect(fila.pin).not.toBe('1234');
  });

  it('cuenta los fallos y muestra los intentos restantes', async () => {
    const { db, fila } = await crearBase();
    const resultado = await verificarAccesoPorUsuario(db, 'ana', '9999');

    expect(resultado).toEqual({ ok: false, motivo: 'pin', intentosRestantes: 4 });
    expect(fila.intentos_fallidos).toBe(1);
    expect(fila.bloqueado_hasta).toBeNull();
  });

  it('bloquea al llegar al máximo de intentos y rechaza el PIN correcto', async () => {
    const { db, fila } = await crearBase();

    for (let i = 0; i < MAX_INTENTOS_PIN - 1; i += 1) {
      const fallo = await verificarAccesoPorUsuario(db, 'ana', '9999');
      expect(fallo.ok).toBe(false);
    }

    const bloqueo = await verificarAccesoPorUsuario(db, 'ana', '9999');
    expect(bloqueo.ok).toBe(false);
    if (!bloqueo.ok) expect(bloqueo.motivo).toBe('bloqueado');
    expect(fila.bloqueado_hasta).toBeTruthy();

    const conPinCorrecto = await verificarAccesoPorUsuario(db, 'ana', '1234');
    expect(conPinCorrecto.ok).toBe(false);
    if (!conPinCorrecto.ok) expect(conPinCorrecto.motivo).toBe('bloqueado');
  });

  it('reinicia el conteo cuando el bloqueo ya expiró', async () => {
    const { db, fila } = await crearBase({
      intentos: MAX_INTENTOS_PIN,
      bloqueadoHasta: new Date(Date.now() - 60_000).toISOString(),
    });

    const resultado = await verificarAccesoPorUsuario(db, 'ana', '1234');
    expect(resultado.ok).toBe(true);
    expect(fila.intentos_fallidos).toBe(0);
    expect(fila.bloqueado_hasta).toBeNull();
  });

  it('rechaza usuarios inactivos, inexistentes o bloqueados por ID', async () => {
    const inactivo = await crearBase({ activo: 0 });
    expect(await verificarAccesoPorUsuario(inactivo.db, 'ana', '1234')).toEqual({
      ok: false,
      motivo: 'inactivo',
    });

    const inexistente = await crearBase();
    expect(await verificarAccesoPorUsuario(inexistente.db, 'otra', '1234')).toEqual({
      ok: false,
      motivo: 'credenciales',
    });

    const porId = await crearBase();
    expect(await verificarAcceso(porId.db, 999, '1234')).toEqual({
      ok: false,
      motivo: 'pin',
      intentosRestantes: 0,
    });
  });
});

describe('recuperarAccesoPorUsuario', () => {
  it('cambia el PIN, invalida el código usado y entrega uno nuevo', async () => {
    const { db, fila } = await crearBase();

    const resultado = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '5678');
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.usuario.usuario).toBe('ana');
    expect(esCodigoRecuperacionValido(resultado.codigoRecuperacion)).toBe(true);
    expect(resultado.codigoRecuperacion).not.toBe(CODIGO_INICIAL);
    expect(fila.pin.startsWith('sha256it$')).toBe(true);
    expect(fila.intentos_fallidos).toBe(0);

    const conNuevoPin = await verificarAccesoPorUsuario(db, 'ana', '5678');
    expect(conNuevoPin.ok).toBe(true);

    const conPinViejo = await verificarAccesoPorUsuario(db, 'ana', '1234');
    expect(conPinViejo.ok).toBe(false);

    const codigoViejo = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '4321');
    expect(codigoViejo.ok).toBe(false);
    if (!codigoViejo.ok) expect(codigoViejo.motivo).toBe('codigo');

    const codigoNuevo = await recuperarAccesoPorUsuario(
      db,
      'ana',
      resultado.codigoRecuperacion,
      '4321'
    );
    expect(codigoNuevo.ok).toBe(true);
  });

  it('acepta el código con minúsculas, espacios y sin guiones', async () => {
    const { db } = await crearBase();
    const resultado = await recuperarAccesoPorUsuario(
      db,
      'ana',
      'abcd efgh jklm',
      '5678'
    );
    expect(resultado.ok).toBe(true);
  });

  it('cuenta los fallos del código y bloquea la cuenta', async () => {
    const { db, fila } = await crearBase();

    for (let i = 0; i < MAX_INTENTOS_PIN - 1; i += 1) {
      const fallo = await recuperarAccesoPorUsuario(db, 'ana', 'ZZZZ-ZZZZ-ZZZZ', '5678');
      expect(fallo.ok).toBe(false);
      if (!fallo.ok) expect(fallo.motivo).toBe('codigo');
    }

    const bloqueo = await recuperarAccesoPorUsuario(db, 'ana', 'ZZZZ-ZZZZ-ZZZZ', '5678');
    expect(bloqueo.ok).toBe(false);
    if (!bloqueo.ok) expect(bloqueo.motivo).toBe('bloqueado');
    expect(fila.bloqueado_hasta).toBeTruthy();

    const codigoCorrecto = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '5678');
    expect(codigoCorrecto.ok).toBe(false);
    if (!codigoCorrecto.ok) expect(codigoCorrecto.motivo).toBe('bloqueado');
  });

  it('no consume intentos si el nuevo PIN no es válido', async () => {
    const { db, fila } = await crearBase();
    const resultado = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '12');

    expect(resultado).toEqual({ ok: false, motivo: 'nuevo_pin_invalido' });
    expect(fila.intentos_fallidos).toBe(0);
  });

  it('explica cuando la cuenta no tiene código de recuperación', async () => {
    const { db, fila } = await crearBase({ codigo: null });
    const resultado = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '5678');

    expect(resultado).toEqual({ ok: false, motivo: 'sin_recuperacion' });
    expect(fila.intentos_fallidos).toBe(0);
  });

  it('rechaza cuentas inactivas o inexistentes', async () => {
    const inactivo = await crearBase({ activo: 0 });
    expect(await recuperarAccesoPorUsuario(inactivo.db, 'ana', CODIGO_INICIAL, '5678')).toEqual({
      ok: false,
      motivo: 'inactivo',
    });

    const inexistente = await crearBase();
    expect(
      await recuperarAccesoPorUsuario(inexistente.db, 'otra', CODIGO_INICIAL, '5678')
    ).toEqual({ ok: false, motivo: 'credenciales' });
  });
});

describe('cambiarPinPropio', () => {
  it('exige el PIN actual y guarda el nuevo', async () => {
    const { db } = await crearBase();

    const incorrecto = await cambiarPinPropio(db, 1, '9999', '5678');
    expect(incorrecto.ok).toBe(false);
    if (!incorrecto.ok) expect(incorrecto.motivo).toBe('pin');

    const correcto = await cambiarPinPropio(db, 1, '1234', '5678');
    expect(correcto.ok).toBe(true);

    expect((await verificarAccesoPorUsuario(db, 'ana', '5678')).ok).toBe(true);
    expect((await verificarAccesoPorUsuario(db, 'ana', '1234')).ok).toBe(false);
  });

  it('valida el nuevo PIN antes de tocar el PIN actual', async () => {
    const { db, fila } = await crearBase();
    const resultado = await cambiarPinPropio(db, 1, '1234', '12');

    expect(resultado).toEqual({ ok: false, motivo: 'nuevo_pin_invalido' });
    expect(fila.intentos_fallidos).toBe(0);
  });

  it('respeta el bloqueo vigente', async () => {
    const { db } = await crearBase({
      intentos: MAX_INTENTOS_PIN,
      bloqueadoHasta: new Date(Date.now() + 60_000).toISOString(),
    });
    const resultado = await cambiarPinPropio(db, 1, '1234', '5678');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('bloqueado');
  });
});

describe('códigos de recuperación desde administración y cuenta propia', () => {
  it('genera un código nuevo y anula el anterior', async () => {
    const { db } = await crearBase();
    const codigo = await establecerCodigoRecuperacion(db, 1);

    expect(codigo).not.toBeNull();
    expect(esCodigoRecuperacionValido(codigo ?? '')).toBe(true);

    const conCodigoViejo = await recuperarAccesoPorUsuario(db, 'ana', CODIGO_INICIAL, '5678');
    expect(conCodigoViejo.ok).toBe(false);

    const conCodigoNuevo = await recuperarAccesoPorUsuario(db, 'ana', codigo!, '5678');
    expect(conCodigoNuevo.ok).toBe(true);
  });

  it('no genera códigos para cuentas eliminadas', async () => {
    const { db, fila } = await crearBase();
    fila.deleted_at = new Date().toISOString();
    expect(await establecerCodigoRecuperacion(db, 1)).toBeNull();
  });

  it('exige el PIN actual para generar el código propio', async () => {
    const { db } = await crearBase();

    const incorrecto = await generarCodigoRecuperacionPropio(db, 1, '9999');
    expect(incorrecto.ok).toBe(false);

    const correcto = await generarCodigoRecuperacionPropio(db, 1, '1234');
    expect(correcto.ok).toBe(true);
    if (correcto.ok) expect(esCodigoRecuperacionValido(correcto.codigo)).toBe(true);
  });

  it('desbloquea una cuenta sin cambiar su PIN', async () => {
    const { db, fila } = await crearBase({
      intentos: MAX_INTENTOS_PIN,
      bloqueadoHasta: new Date(Date.now() + 60_000).toISOString(),
    });

    await desbloquearUsuario(db, 1);
    expect(fila.intentos_fallidos).toBe(0);
    expect(fila.bloqueado_hasta).toBeNull();

    const resultado = await verificarAccesoPorUsuario(db, 'ana', '1234');
    expect(resultado.ok).toBe(true);
  });
});
