// Generador PDF mínimo sin dependencias.
// Construye un documento PDF A4 con texto, tabla y totales, usando fuentes base
// Helvetica (no requiere incrustar tipografías) y codificación Latin-1/WinAnsi.

interface OpcionTexto {
  tam?: number;
  negrita?: boolean;
  derecha?: boolean;
  gris?: boolean;
}

class PdfDoc {
  private paginas: string[][] = [];
  private actual: string[] = [];

  readonly ancho = 595.28;
  readonly alto = 841.89;
  readonly margen = 48;

  constructor() {
    this.nuevaPagina();
  }

  nuevaPagina() {
    if (this.actual.length > 0) {
      this.paginas.push(this.actual);
    }
    this.actual = [];
  }

  // Escribe texto en coordenadas absolutas (origen abajo-izquierda).
  texto(x: number, y: number, s: string, op: OpcionTexto = {}) {
    const tam = op.tam ?? 10;
    const fuente = op.negrita ? '/F2' : '/F1';
    let tx = x;
    if (op.derecha) {
      tx = x - this.anchoTexto(s, tam);
    }
    this.actual.push(
      `BT ${fuente} ${tam} Tf 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${this.escapar(s)}) Tj ET`
    );
  }

  linea(x1: number, y1: number, x2: number, y2: number) {
    this.actual.push(
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  private anchoTexto(s: string, tam: number): number {
    // Aproximación Helvetica: ~0.5 * tamaño por carácter.
    return s.length * tam * 0.52;
  }

  private escapar(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  generar(): Uint8Array {
    this.nuevaPagina();

    const contenidoIds: number[] = [];
    let id = 5; // 1 catalog, 2 pages, 3 F1, 4 F2
    for (const pag of this.paginas) {
      contenidoIds.push(id);
      id += 1;
    }
    const paginasIds: number[] = [];
    for (let i = 0; i < this.paginas.length; i++) {
      paginasIds.push(5 + i * 2);
    }
    const total = 5 + this.paginas.length * 2;

    const objetos: string[] = [];
    objetos[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;
    const kids = paginasIds.map((p) => `${p} 0 R`).join(' ');
    objetos[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${paginasIds.length} >>\nendobj`;
    objetos[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`;
    objetos[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`;

    let obj = 5;
    for (let i = 0; i < this.paginas.length; i++) {
      const contenido = this.paginas[i].join('\n');
      const contenidoId = obj + 1;
      objetos[obj] = `${obj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.ancho} ${this.alto}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contenidoId} 0 R >>\nendobj`;
      objetos[contenidoId] = `${contenidoId} 0 obj\n<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream\nendobj`;
      obj += 2;
    }

    const cabeza = '%PDF-1.4\n';
    const cola = `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n`;
    const eof = '\n%%EOF';

    let out = cabeza;
    const xRef: number[] = [];
    for (let i = 1; i < total; i++) {
      xRef[i] = out.length;
      out += objetos[i] + '\n';
    }
    const xrefPos = out.length;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) {
      xref += `${String(xRef[i]).padStart(10, '0')} 00000 n \n`;
    }
    out += xref + cola + xrefPos + eof;

    // PDF requiere bytes Latin-1; los caracteres fuera de 0xFF se sustituyen.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const code = out.charCodeAt(i);
      bytes[i] = code <= 0xff ? code : 0x3f;
    }
    return bytes;
  }
}

// Codifica texto plano a Latin-1 para incrustar en el PDF.
export function aLatin1(s: string): string {
  let r = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32;
    if (code >= 32 && code <= 0xff) {
      r += ch;
    } else if (code > 0xff) {
      const mapa: Record<number, string> = {
        0x2013: '-', 0x2014: '-', 0x2018: "'", 0x2019: "'",
        0x201c: '"', 0x201d: '"', 0x20ac: 'EUR', 0x2026: '...',
      };
      r += mapa[code] ?? '?';
    }
  }
  return r;
}

export interface FilaItemPdfVenta {
  nombre: string;
  cantidad: number;
  subtotal: number;
}

export interface FilaPdfVenta {
  numero: string;
  fecha: string;
  hora: string;
  usuario: string;
  forma: string;
  total: string;
  efectivo: string;
  digital: string;
  estado: string;
  items: FilaItemPdfVenta[];
}

export interface DatosReporteVentas {
  negocio: string;
  titulo: string;
  rango: string;
  generado: string;
  simbolo: string;
  filas: FilaPdfVenta[];
  totalVentas: number;
  totalEfectivo: string;
  totalDigital: string;
  totalGeneral: string;
  anuladas: number;
}

const COLUMNAS = [
  { x: 0, etiqueta: 'N.º', ancho: 40 },
  { x: 44, etiqueta: 'Fecha', ancho: 66 },
  { x: 114, etiqueta: 'Hora', ancho: 58 },
  { x: 176, etiqueta: 'Usuario', ancho: 100 },
  { x: 280, etiqueta: 'Forma de pago', ancho: 90 },
  { x: 374, etiqueta: 'Total', ancho: 56, derecha: true },
  { x: 434, etiqueta: 'Estado', ancho: 65, derecha: true },
];

const ALTURA_FILA = 16;
const ALTURA_CABECERA = 20;
const LIMITE_INFERIOR = 66;

export function generarPdfVentas(datos: DatosReporteVentas): Uint8Array {
  const pdf = new PdfDoc();
  const margen = pdf.margen;
  const anchoContenido = pdf.ancho - margen * 2;

  let y = pdf.alto - 56;

  pdf.texto(margen, y, aLatin1(datos.negocio), { tam: 16, negrita: true });
  y -= 24;
  pdf.texto(margen, y, aLatin1(datos.titulo), { tam: 12, negrita: true, gris: true });
  y -= 18;
  pdf.texto(margen, y, aLatin1(`Período: ${datos.rango}`), { tam: 9 });
  y -= 14;
  pdf.texto(margen, y, aLatin1(`Generado: ${datos.generado}`), { tam: 9 });
  y -= 24;

  const cabeceraY = y;

  let pagina = 1;
  const filasTotales =
    datos.filas.length + datos.filas.reduce((a, f) => a + f.items.length, 0);
  const totalPaginas = Math.max(1, Math.ceil(filasTotales / 38));

  function dibujarCabecera() {
    pdf.texto(margen, cabeceraY, aLatin1(datos.titulo), { tam: 10, negrita: true });
    pdf.linea(margen, cabeceraY - 6, margen + anchoContenido, cabeceraY - 6);
    for (const c of COLUMNAS) {
      const x = margen + c.x;
      pdf.texto(x, cabeceraY - 22, aLatin1(c.etiqueta), {
        tam: 8.5,
        negrita: true,
        derecha: c.derecha,
      });
    }
    return cabeceraY - 22 - 8;
  }

  y = dibujarCabecera();

  function saltarPagina() {
    pdf.texto(margen, 40, `Página ${pagina} de ${totalPaginas}`, { tam: 8, gris: true });
    pdf.nuevaPagina();
    pagina += 1;
    y = pdf.alto - 56;
    y = dibujarCabecera();
  }

  let grupoAnterior = '';
  for (const f of datos.filas) {
    const cambioGrupo = f.fecha !== grupoAnterior;
    if (cambioGrupo) {
      if (y < LIMITE_INFERIOR + 20) {
        saltarPagina();
      }
      if (grupoAnterior !== '') {
        y -= 7;
        pdf.linea(margen, y, margen + anchoContenido, y);
        y -= 8;
      }
      grupoAnterior = f.fecha;
    }
    if (y < LIMITE_INFERIOR) {
      saltarPagina();
    }
    const filaY = y;
    pdf.texto(margen + COLUMNAS[0].x, filaY, f.numero, { tam: 8.5 });
    pdf.texto(margen + COLUMNAS[1].x, filaY, f.fecha, { tam: 8.5 });
    pdf.texto(margen + COLUMNAS[2].x, filaY, f.hora, { tam: 8.5 });
    pdf.texto(margen + COLUMNAS[3].x, filaY, f.usuario, { tam: 8.5 });
    pdf.texto(margen + COLUMNAS[4].x, filaY, f.forma, { tam: 8.5 });
    pdf.texto(margen + COLUMNAS[5].x + COLUMNAS[5].ancho, filaY, f.total, { tam: 8.5, derecha: true });
    pdf.texto(margen + COLUMNAS[6].x + COLUMNAS[6].ancho, filaY, f.estado, { tam: 8.5, derecha: true });
    y -= ALTURA_FILA;

    for (const it of f.items) {
      if (y < LIMITE_INFERIOR) {
        saltarPagina();
      }
      pdf.texto(margen + 46, y, aLatin1(`· ${it.cantidad} × ${it.nombre}`), { tam: 8 });
      const sub = `${datos.simbolo}${it.subtotal.toLocaleString('es-CU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      pdf.texto(margen + anchoContenido, y, sub, { tam: 8, derecha: true });
      y -= 13.5;
    }
  }

  y -= 8;
  pdf.linea(margen, y, margen + anchoContenido, y);
  y -= 20;
  pdf.texto(margen, y, `Ventas válidas: ${datos.totalVentas}${datos.anuladas > 0 ? `  ·  Anuladas: ${datos.anuladas}` : ''}`, { tam: 9, negrita: true });
  y -= 16;
  pdf.texto(margen, y, `Total general: ${datos.totalGeneral}`, { tam: 10, negrita: true });
  y -= 16;
  pdf.texto(margen, y, `Efectivo: ${datos.totalEfectivo}`, { tam: 9 });
  pdf.texto(margen + anchoContenido / 2, y, `Digital: ${datos.totalDigital}`, { tam: 9 });
  y -= 24;
  pdf.texto(margen, y, `Página ${pagina} de ${totalPaginas}`, { tam: 8, gris: true });

  return pdf.generar();
}
