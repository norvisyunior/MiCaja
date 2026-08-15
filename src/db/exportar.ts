import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listarVentas } from './repos/ventas';
import { obtenerSettings } from './repos/settings';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import { claveDiaLocal, finDiaISO, inicioDiaISO, inicioMesISO, inicioSemanaISO } from '../utils/fechas';
import {
  aLatin1,
  generarPdfVentas,
  type DatosReporteVentas,
  type FilaPdfVenta,
} from '../utils/pdfUil';

export type RangoExportacion = 'hoy' | 'semana' | 'mes' | 'dia';

export interface OpcionesExportacion {
  rango: RangoExportacion;
  dia: Date;
}

export function rangoFechasExportacion(opciones: OpcionesExportacion): { desde: string; hasta: string; etiqueta: string } {
  if (opciones.rango === 'hoy') {
    return { desde: inicioDiaISO(), hasta: finDiaISO(), etiqueta: 'del día de hoy' };
  }
  if (opciones.rango === 'semana') {
    return { desde: inicioSemanaISO(), hasta: finDiaISO(), etiqueta: 'de la semana actual' };
  }
  if (opciones.rango === 'mes') {
    return { desde: inicioMesISO(), hasta: finDiaISO(), etiqueta: 'del mes actual' };
  }
  const dia = opciones.dia;
  return {
    desde: inicioDiaISO(dia),
    hasta: finDiaISO(dia),
    etiqueta: `del ${dia.toLocaleDateString('es-CU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  };
}

function nombreArchivo(rango: RangoExportacion, dia: Date): string {
  const base = `ventas-${claveDiaLocal()}`;
  const sufijo = rango === 'mes' ? '-mes' : rango === 'semana' ? '-semana' : rango === 'dia' ? `-${claveDiaLocal(dia)}` : '';
  return `${base}${sufijo}.pdf`;
}

async function compartirPdfWeb(nombre: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

async function compartirPdfNativo(nombre: string, bytes: Uint8Array): Promise<boolean> {
  const archivo = new File(Paths.cache, nombre);
  archivo.create({ overwrite: true, intermediates: true });
  archivo.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Exportar ventas',
      UTI: 'com.adobe.pdf',
    });
    return true;
  }
  return false;
}

export async function exportarVentasPDF(
  db: SQLiteDatabase,
  opciones: OpcionesExportacion
): Promise<boolean> {
  const { desde, hasta, etiqueta } = rangoFechasExportacion(opciones);
  const ventas = await listarVentas(db, desde, hasta);
  const settings = await obtenerSettings(db);
  const simbolo = settings.simboloMoneda ?? '$';

  const validas = ventas.filter((v) => !v.anulada);
  const anuladas = ventas.length - validas.length;
  const fmt = (n: number) => `${simbolo}${n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filas: FilaPdfVenta[] = ventas.map((v) => {
    const d = new Date(v.fechaIso);
    return {
      numero: String(v.numero),
      fecha: d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      hora: d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' }),
      usuario: v.usuarioNombre ?? '',
      forma: NOMBRES_FORMA_PAGO[v.formaPago] ?? v.formaPago,
      total: fmt(v.total),
      efectivo: fmt(v.montoEfectivo),
      digital: fmt(v.montoDigital),
      estado: v.anulada ? 'ANULADA' : 'VÁLIDA',
      items: v.items.map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
      })),
    };
  });

  const totalGeneral = validas.reduce((a, v) => a + v.total, 0);
  const totalEfectivo = validas.reduce((a, v) => a + v.montoEfectivo, 0);
  const totalDigital = validas.reduce((a, v) => a + v.montoDigital, 0);

  const datosReporte: DatosReporteVentas = {
    negocio: aLatin1(settings.nombreNegocio ?? 'Caja Rápida'),
    titulo: 'Reporte de ventas',
    rango: aLatin1(etiqueta),
    generado: aLatin1(new Date().toLocaleString('es-CU', { dateStyle: 'long', timeStyle: 'short' })),
    simbolo,
    filas,
    totalVentas: validas.length,
    totalEfectivo: fmt(totalEfectivo),
    totalDigital: fmt(totalDigital),
    totalGeneral: fmt(totalGeneral),
    anuladas,
  };

  const bytes = generarPdfVentas(datosReporte);
  const nombre = nombreArchivo(opciones.rango, opciones.dia);

  if (Platform.OS === 'web') {
    return compartirPdfWeb(nombre, bytes);
  }
  return compartirPdfNativo(nombre, bytes);
}

// Exportación CSV legacy (todas las ventas).
export async function exportarVentasCSV(db: SQLiteDatabase): Promise<boolean> {
  const ventas = await listarVentas(db, '2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z');
  const settings = await obtenerSettings(db);
  const simbolo = settings.simboloMoneda ?? '$';
  const lineas: string[] = [
    ['Número', 'Fecha', 'Usuario', 'Forma de pago', 'Total', 'Estado'].map((h) => escaparCSV(h)).join(','),
  ];
  for (const v of ventas) {
    const d = new Date(v.fechaIso);
    lineas.push(
      [
        v.numero,
        d.toLocaleDateString('es-CU'),
        v.usuarioNombre ?? '',
        NOMBRES_FORMA_PAGO[v.formaPago] ?? v.formaPago,
        `${simbolo}${v.total.toFixed(2)}`,
        v.anulada ? 'Anulada' : 'Válida',
      ]
        .map((x) => escaparCSV(x))
        .join(',')
    );
  }
  const archivo = new File(Paths.cache, `ventas-${claveDiaLocal()}.csv`);
  archivo.create({ overwrite: true, intermediates: true });
  archivo.write(lineas.join('\n'), { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar ventas' });
    return true;
  }
  return false;
}

function escaparCSV(v: string | number): string {
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}