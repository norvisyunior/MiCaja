export type TipoCelda =
  | 'texto'
  | 'fecha'
  | 'fechaHora'
  | 'moneda'
  | 'numero'
  | 'booleano'
  | 'insignia';

export type AccionControl =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'reset-pin'
  | 'ajustar-stock'
  | 'anular'
  | 'editar-dispositivo';

export interface ColumnaControl {
  clave: string;
  etiqueta: string;
  tipo?: TipoCelda;
  secundaria?: string;
}

export interface ConfigRecurso {
  slug: string;
  titulo: string;
  descripcion: string;
  columnas: ColumnaControl[];
  acciones: AccionControl[];
}

export const RECURSOS: ConfigRecurso[] = [
  {
    slug: 'usuarios',
    titulo: 'Usuarios',
    descripcion: 'Cuentas de acceso de todos los negocios. El PIN inicial es siempre 1234.',
    columnas: [
      { clave: 'nombre', etiqueta: 'Usuario', secundaria: 'usuario' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'rol', etiqueta: 'Rol', tipo: 'insignia' },
      { clave: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
      { clave: 'version', etiqueta: 'Versión', tipo: 'numero' },
      { clave: 'created_at', etiqueta: 'Alta', tipo: 'fecha' },
    ],
    acciones: ['crear', 'editar', 'reset-pin', 'eliminar'],
  },
  {
    slug: 'categorias',
    titulo: 'Categorías',
    descripcion: 'Clasificación del catálogo de cada negocio.',
    columnas: [
      { clave: 'nombre', etiqueta: 'Categoría' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'color', etiqueta: 'Color' },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
      { clave: 'activo', etiqueta: 'Activa', tipo: 'booleano' },
      { clave: 'version', etiqueta: 'Versión', tipo: 'numero' },
    ],
    acciones: ['crear', 'editar', 'eliminar'],
  },
  {
    slug: 'productos',
    titulo: 'Productos',
    descripcion: 'Catálogo y existencias. El stock se corrige con movimientos, nunca a mano.',
    columnas: [
      { clave: 'nombre', etiqueta: 'Producto', secundaria: 'emoji' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'precio', etiqueta: 'Precio', tipo: 'moneda' },
      { clave: 'stock_actual', etiqueta: 'Stock', tipo: 'numero' },
      { clave: 'stock_minimo', etiqueta: 'Mínimo', tipo: 'numero' },
      { clave: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
      { clave: 'version', etiqueta: 'Versión', tipo: 'numero' },
    ],
    acciones: ['crear', 'editar', 'ajustar-stock', 'eliminar'],
  },
  {
    slug: 'ventas',
    titulo: 'Ventas',
    descripcion: 'Historial completo. Solo se permite anular con motivo; no editar importes.',
    columnas: [
      { clave: 'numero', etiqueta: '#', tipo: 'numero' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'fecha_cliente', etiqueta: 'Fecha', tipo: 'fechaHora' },
      { clave: 'total_venta', etiqueta: 'Total', tipo: 'moneda' },
      { clave: 'forma_pago', etiqueta: 'Pago', tipo: 'insignia' },
      { clave: 'anulada', etiqueta: 'Anulada', tipo: 'booleano' },
    ],
    acciones: ['anular'],
  },
  {
    slug: 'turnos',
    titulo: 'Turnos de caja',
    descripcion: 'Aperturas y cierres registrados por las terminales.',
    columnas: [
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'apertura', etiqueta: 'Apertura', tipo: 'fechaHora' },
      { clave: 'cierre', etiqueta: 'Cierre', tipo: 'fechaHora' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'insignia' },
      { clave: 'total_esperado', etiqueta: 'Esperado', tipo: 'moneda' },
      { clave: 'diferencia', etiqueta: 'Diferencia', tipo: 'moneda' },
    ],
    acciones: [],
  },
  {
    slug: 'gastos',
    titulo: 'Gastos',
    descripcion: 'Gastos registrados por los negocios.',
    columnas: [
      { clave: 'concepto', etiqueta: 'Concepto' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'insignia' },
      { clave: 'monto', etiqueta: 'Monto', tipo: 'moneda' },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
      { clave: 'forma_pago', etiqueta: 'Pago', tipo: 'insignia' },
    ],
    acciones: [],
  },
  {
    slug: 'movimientos-caja',
    titulo: 'Movimientos de caja',
    descripcion: 'Entradas, retiros y gastos asociados a cada turno.',
    columnas: [
      { clave: 'descripcion', etiqueta: 'Descripción' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'insignia' },
      { clave: 'monto', etiqueta: 'Monto', tipo: 'moneda' },
      { clave: 'created_at', etiqueta: 'Fecha', tipo: 'fechaHora' },
    ],
    acciones: [],
  },
  {
    slug: 'conteos',
    titulo: 'Conteos de inventario',
    descripcion: 'Diferencias físicas detectadas al cerrar la caja.',
    columnas: [
      { clave: 'producto_nombre', etiqueta: 'Producto' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'cantidad_sistema', etiqueta: 'Sistema', tipo: 'numero' },
      { clave: 'cantidad_contada', etiqueta: 'Contado', tipo: 'numero' },
      { clave: 'diferencia', etiqueta: 'Diferencia', tipo: 'numero' },
      { clave: 'motivo', etiqueta: 'Motivo' },
    ],
    acciones: [],
  },
  {
    slug: 'dispositivos',
    titulo: 'Terminales',
    descripcion: 'Instalaciones registradas, su estado y última sincronización.',
    columnas: [
      { clave: 'nombre', etiqueta: 'Terminal', secundaria: 'plataforma' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'rol', etiqueta: 'Rol', tipo: 'insignia' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'insignia' },
      { clave: 'last_sync_at', etiqueta: 'Última sync', tipo: 'fechaHora' },
    ],
    acciones: ['editar-dispositivo'],
  },
  {
    slug: 'invitaciones',
    titulo: 'Invitaciones',
    descripcion: 'Códigos de invitación generados para nuevas terminales.',
    columnas: [
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'rol', etiqueta: 'Rol', tipo: 'insignia' },
      { clave: 'expira_en', etiqueta: 'Expira', tipo: 'fechaHora' },
      { clave: 'usado_en', etiqueta: 'Usada', tipo: 'fechaHora' },
      { clave: 'created_at', etiqueta: 'Alta', tipo: 'fechaHora' },
    ],
    acciones: [],
  },
  {
    slug: 'auditoria',
    titulo: 'Auditoría',
    descripcion: 'Registro de todas las acciones realizadas desde el panel.',
    columnas: [
      { clave: 'accion', etiqueta: 'Acción', tipo: 'insignia' },
      { clave: 'empresa_nombre', etiqueta: 'Negocio' },
      { clave: 'actor_tipo', etiqueta: 'Actor', tipo: 'insignia' },
      { clave: 'entidad', etiqueta: 'Entidad' },
      { clave: 'created_at', etiqueta: 'Fecha', tipo: 'fechaHora' },
    ],
    acciones: [],
  },
];

export function configuracionRecurso(slug: string | undefined): ConfigRecurso | undefined {
  return RECURSOS.find((recurso) => recurso.slug === slug);
}
