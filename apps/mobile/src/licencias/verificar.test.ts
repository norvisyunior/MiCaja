import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { clavePublicaDesdeSpki } from './token';
import {
  CLAVE_PUBLICA_LICENCIA,
  bloqueoPorEstado,
  evaluarTokenLicencia,
  licenciaPermite,
  type ResultadoLicencia,
} from './verificar';
import type { PayloadLicencia } from './token';

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function bytesDe(texto: string): Uint8Array {
  return new Uint8Array(Buffer.from(texto, 'utf8'));
}

const par = nacl.sign.keyPair();

/** Construye un SPKI válido para `clavePublicaDesdeSpki`: prefijo DER + clave. */
function spki(clave: Uint8Array): string {
  const der = new Uint8Array([...new Uint8Array(12).fill(0x30), ...clave]);
  return Buffer.from(der).toString('base64');
}

function firmar(payload: PayloadLicencia, clavePrivada = par.secretKey): string {
  const segmento = b64url(bytesDe(JSON.stringify(payload)));
  const firma = nacl.sign.detached(new Uint8Array(Buffer.from(segmento, 'ascii')), clavePrivada);
  return `${segmento}.${b64url(firma)}`;
}

const AHORA = 1_760_000_000;

function payloadCon(ajustes: Partial<PayloadLicencia>): PayloadLicencia {
  return {
    v: 1,
    licenseId: '1f0a3c2e-8b4d-4a7e-9c1f-2d3e4f5a6b7c',
    empresaId: 'a1b2c3d4-0000-4000-8000-000000000001',
    deviceId: 'a1b2c3d4-0000-4000-8000-000000000002',
    plan: 'basico',
    features: ['ventas', 'inventario'],
    iat: AHORA - 86_400,
    exp: AHORA + 86_400,
    graceUntil: null,
    keyId: 'v1',
    ...ajustes,
  };
}

describe('evaluarTokenLicencia', () => {
  it('acepta una licencia vigente', () => {
    const token = firmar(payloadCon({}));
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('activa');
    expect(r.valida).toBe(true);
    expect(r.enGracia).toBe(false);
    expect(r.payload?.plan).toBe('basico');
  });

  it('acepta el periodo de gracia tras el vencimiento', () => {
    const token = firmar(
      payloadCon({ exp: AHORA - 1_000, graceUntil: AHORA + 10_000 })
    );
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('gracia');
    expect(r.valida).toBe(true);
    expect(r.enGracia).toBe(true);
  });

  it('marca vencida una licencia pasadas la vigencia y la gracia', () => {
    const token = firmar(
      payloadCon({ exp: AHORA - 10_000, graceUntil: AHORA - 1_000 })
    );
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('vencida');
    expect(r.valida).toBe(false);
    expect(r.motivo).toBe('vencida');
  });

  it('trata como vencida una licencia expirada sin gracia', () => {
    const token = firmar(payloadCon({ exp: AHORA - 10_000, graceUntil: null }));
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('vencida');
  });

  it('rechaza la firma de otra clave', () => {
    const otra = nacl.sign.keyPair();
    const token = firmar(payloadCon({}), otra.secretKey);
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('invalida');
    expect(r.motivo).toBe('firma');
  });

  it('rechaza un payload alterado después de firmar', () => {
    const token = firmar(payloadCon({}));
    const [segmento, firma] = token.split('.');
    const alterado = firmar(payloadCon({ plan: 'premium' })).split('.')[0];
    const r = evaluarTokenLicencia(`${alterado}.${firma}`, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(segmento).not.toBe(alterado);
    expect(r.estado).toBe('invalida');
    expect(r.motivo).toBe('firma');
  });

  it('rechaza una licencia de otra empresa', () => {
    const token = firmar(payloadCon({}));
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      empresaId: 'otra-empresa',
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('invalida');
    expect(r.motivo).toBe('empresa');
  });

  it('rechaza una licencia de otro dispositivo', () => {
    const token = firmar(payloadCon({}));
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      deviceId: 'otro-dispositivo',
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('invalida');
    expect(r.motivo).toBe('dispositivo');
  });

  it('no comprueba dispositivo si la licencia no está vinculada', () => {
    const token = firmar(payloadCon({ deviceId: null }));
    const r = evaluarTokenLicencia(token, {
      clavePublica: spki(par.publicKey),
      deviceId: 'cualquiera',
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('activa');
  });

  it('devuelve inválida ante tokens malformados sin lanzar', () => {
    for (const token of ['', 'a.b.c', 'x.y', 'no-es-un-token']) {
      const r = evaluarTokenLicencia(token, { clavePublica: spki(par.publicKey) });
      expect(r.estado).toBe('invalida');
      expect(r.valida).toBe(false);
    }
  });

  it('descarta tokens con JSON válido pero firma corrupta', () => {
    const token = firmar(payloadCon({}));
    const corrupto = `${token.split('.')[0]}.${b64url(new Uint8Array(64).fill(1))}`;
    const r = evaluarTokenLicencia(corrupto, {
      clavePublica: spki(par.publicKey),
      ahoraSegundos: AHORA,
    });
    expect(r.estado).toBe('invalida');
  });
});

describe('bloqueoPorEstado', () => {
  it('bloquea ventas y turnos con licencia vencida', () => {
    const bloqueo = bloqueoPorEstado('vencida');
    expect(bloqueo).not.toBeNull();
    expect(bloqueo?.titulo).toContain('vencida');
    expect(bloqueo?.mensaje).toContain('ventas');
  });

  it('bloquea con licencia inválida', () => {
    const bloqueo = bloqueoPorEstado('invalida');
    expect(bloqueo).not.toBeNull();
    expect(bloqueo?.titulo).toContain('no válida');
  });

  it('no bloquea los estados operativos', () => {
    expect(bloqueoPorEstado('activa')).toBeNull();
    expect(bloqueoPorEstado('gracia')).toBeNull();
    expect(bloqueoPorEstado('sin_licencia')).toBeNull();
  });
});

describe('licenciaPermite', () => {
  const r = (parcial: Partial<ResultadoLicencia>): ResultadoLicencia => ({
    estado: 'activa',
    valida: true,
    enGracia: false,
    ...parcial,
  });

  it('permite todo en modo local sin licencia', () => {
    expect(licenciaPermite(r({ estado: 'sin_licencia', payload: undefined }), 'lo-que-sea')).toBe(
      true
    );
  });

  it('permite features incluidas y niega las demás', () => {
    const activa = r({
      payload: payloadCon({ features: ['ventas'] }),
    });
    expect(licenciaPermite(activa, 'ventas')).toBe(true);
    expect(licenciaPermite(activa, 'reportes')).toBe(false);
  });

  it('niega todo con licencia vencida o inválida', () => {
    const vencida = r({ estado: 'vencida', valida: false, payload: payloadCon({}) });
    const invalida = r({ estado: 'invalida', valida: false });
    expect(licenciaPermite(vencida, 'ventas')).toBe(false);
    expect(licenciaPermite(invalida, 'ventas')).toBe(false);
  });
});

describe('CLAVE_PUBLICA_LICENCIA', () => {
  it('es un SPKI Ed25519 parseable y extrae 32 bytes', () => {
    // Si algún día se rota la clave, esta prueba avisa de que el formato rompió.
    const clave = clavePublicaDesdeSpki(CLAVE_PUBLICA_LICENCIA);
    expect(clave).toHaveLength(32);
  });
});
