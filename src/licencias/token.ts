export interface PayloadLicencia {
  v: number;
  licenseId: string;
  empresaId: string;
  deviceId: string | null;
  plan: string;
  features: string[];
  iat: number;
  exp: number;
  graceUntil: number | null;
  keyId: string;
}

const ALFABETO_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALFABETO_BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodificarBase64(valor: string, alfabeto: string): Uint8Array {
  const limpio = valor.replace(/=+$/, '').replace(/\s/g, '');
  const salida: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const caracter of limpio) {
    const indice = alfabeto.indexOf(caracter);
    if (indice === -1) throw new Error('BASE64_INVALIDO');
    buffer = (buffer << 6) | indice;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(salida);
}

function bytesAUtf8(bytes: Uint8Array): string {
  let escapado = '';
  for (const byte of bytes) {
    escapado += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(escapado);
}

function textoABytes(texto: string): Uint8Array {
  const salida = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) {
    salida[i] = texto.charCodeAt(i) & 0xff;
  }
  return salida;
}

export interface TokenLicenciaDecodificado {
  payload: PayloadLicencia;
  segmentoPayload: string;
  firma: Uint8Array;
  payloadBytes: Uint8Array;
}

export function decodificarTokenLicencia(token: string): TokenLicenciaDecodificado {
  const partes = token.trim().split('.');
  if (partes.length !== 2) throw new Error('LICENCIA_MALFORMADA');

  const [segmentoPayload, segmentoFirma] = partes;
  const json = bytesAUtf8(decodificarBase64(segmentoPayload, ALFABETO_URL));
  const payload = JSON.parse(json) as PayloadLicencia;

  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.licenseId !== 'string' ||
    typeof payload.empresaId !== 'string' ||
    typeof payload.plan !== 'string' ||
    !Array.isArray(payload.features) ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('LICENCIA_MALFORMADA');
  }

  return {
    payload,
    segmentoPayload,
    firma: decodificarBase64(segmentoFirma, ALFABETO_URL),
    payloadBytes: textoABytes(segmentoPayload),
  };
}

export function clavePublicaDesdeSpki(base64: string): Uint8Array {
  const der = decodificarBase64(base64, ALFABETO_BASE64);
  if (der.length < 32) throw new Error('CLAVE_PUBLICA_INVALIDA');
  return der.slice(der.length - 32);
}
