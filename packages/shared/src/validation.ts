import { z } from 'zod';
import {
  DISPOSITIVO_ESTADOS,
  EMPRESA_ESTADOS,
  FORMAS_PAGO,
  LICENCIA_ESTADOS,
  PLATAFORMAS,
  SYNC_ESTADOS,
  USUARIO_ROLES,
} from './types';
import { licensePayloadSchema } from './license';

export const uuidSchema = z.string().uuid();

/**
 * Límites de negocio/DB compartidos por el cliente y el servidor.
 * Evitan que un payload absurdo (o malicioso) desborde las columnas
 * `numeric(14,2)` / `numeric(14,3)` y termine en un error 500.
 */
export const MAX_MONTO = 100_000_000_000;
export const MAX_CANTIDAD = 1_000_000;
export const MAX_STOCK = 100_000_000;

export const activacionSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'CODIGO_INVALIDO'),
  fingerprint: z.string().min(8).max(200),
  nombre: z.string().trim().min(1).max(80),
  plataforma: z.enum(PLATAFORMAS),
  appVersion: z.string().max(50).default(''),
  // Reemplazo de dispositivo: id del dispositivo que se retira porque se
  // perdió o se averió. Solo tiene efecto cuando no quedan plazas libres.
  reemplazarA: uuidSchema.optional(),
});

export type ActivacionInput = z.infer<typeof activacionSchema>;

export const invitacionSchema = z.object({
  rol: z.enum(['admin', 'dependiente']).default('dependiente'),
  expiraHoras: z.coerce.number().int().min(1).max(720).default(72),
});

export type InvitacionInput = z.infer<typeof invitacionSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/**
 * Login de una cuenta de negocio (propietario/admin/dependiente) con su
 * usuario global y PIN. La huella identifica la instalación que intenta
 * entrar: el servidor la usa para reutilizar o aprovisionar su dispositivo.
 */
export const usuarioLoginSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((valor) => valor.toLowerCase()),
  pin: z.string().regex(/^\d{4}$/, 'PIN_INVALIDO'),
  fingerprint: z.string().min(8).max(200),
  nombre: z.string().trim().min(1).max(80),
  plataforma: z.enum(PLATAFORMAS),
  appVersion: z.string().max(50).default(''),
  reemplazarA: uuidSchema.optional(),
  cambiarEmpresa: z.boolean().default(false),
});

export type UsuarioLoginInput = z.infer<typeof usuarioLoginSchema>;

export const empresaInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  propietario: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().optional(),
  telefono: z.string().trim().max(30).optional(),
  planCodigo: z.string().trim().min(1).max(50).default('basico'),
  venceEn: z.string().datetime().optional(),
  graceDias: z.number().int().min(0).max(365).default(7),
});

export type EmpresaInput = z.infer<typeof empresaInputSchema>;

export const registroSchema = empresaInputSchema.pick({
  nombre: true,
  propietario: true,
  email: true,
  telefono: true,
  planCodigo: true,
});

export type RegistroInput = z.infer<typeof registroSchema>;

export const licenciaInputSchema = z.object({
  empresaId: uuidSchema,
  planCodigo: z.string().trim().min(1).max(50),
  venceEn: z.string().datetime(),
  graceDias: z.number().int().min(0).max(365).default(7),
});

export type LicenciaInput = z.infer<typeof licenciaInputSchema>;

export const usuarioInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  usuario: z.string().trim().min(3).max(40),
  rol: z.enum(USUARIO_ROLES).default('dependiente'),
  activo: z.boolean().default(true),
});

export type UsuarioInput = z.infer<typeof usuarioInputSchema>;

export const categoriaInputSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E2E8F0'),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
});

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;

export const productoInputSchema = z.object({
  categoriaId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precio: z.number().finite().min(0).max(MAX_MONTO),
  costoUnitario: z.number().finite().min(0).max(MAX_MONTO).nullable().optional(),
  emoji: z.string().max(16).default('🍽️'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0EA5E9'),
  imagen: z.string().max(2_000_000).nullable().optional(),
  orden: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  activo: z.boolean().default(true),
  stockMinimo: z.number().finite().min(0).max(MAX_STOCK).default(0),
});

export type ProductoInput = z.infer<typeof productoInputSchema>;

export const ventaItemInputSchema = z.object({
  productoId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precioUnitario: z.number().finite().min(0).max(MAX_MONTO),
  costoUnitario: z.number().finite().min(0).max(MAX_MONTO).nullable().optional(),
  cantidad: z.number().finite().positive().max(MAX_CANTIDAD),
  subtotal: z.number().finite().min(0).max(MAX_MONTO),
});

export const ventaInputSchema = z.object({
  localId: uuidSchema,
  usuarioId: uuidSchema,
  turnoId: uuidSchema.nullable().optional(),
  fechaCliente: z.string().datetime(),
  subtotal: z.number().finite().min(0).max(MAX_MONTO),
  descuentoPct: z.number().finite().min(0).max(100).default(0),
  total: z.number().finite().min(0).max(MAX_MONTO),
  formaPago: z.enum(FORMAS_PAGO),
  montoEfectivo: z.number().finite().min(0).max(MAX_MONTO).default(0),
  montoDigital: z.number().finite().min(0).max(MAX_MONTO).default(0),
  items: z.array(ventaItemInputSchema).min(1).max(200),
});

export type VentaInput = z.infer<typeof ventaInputSchema>;

export const CATEGORIAS_GASTO = [
  'transporte',
  'servicios',
  'salarios',
  'electricidad',
  'alquiler',
  'otros',
] as const;

export const gastoInputSchema = z.object({
  id: uuidSchema,
  categoria: z.enum(CATEGORIAS_GASTO),
  concepto: z.string().trim().min(1).max(120),
  monto: z.number().finite().positive().max(MAX_MONTO),
  fecha: z.string().datetime(),
  formaPago: z.enum(FORMAS_PAGO).default('efectivo'),
  version: z.number().int().min(1).max(2_147_483_647),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type GastoInput = z.infer<typeof gastoInputSchema>;

export const TIPOS_MOVIMIENTO_CAJA = [
  'entrada',
  'retiro',
  'gasto',
  'otra_salida',
] as const;

export const movimientoCajaInputSchema = z.object({
  id: uuidSchema,
  turnoId: uuidSchema.nullable().optional(),
  usuarioId: uuidSchema.nullable().optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO_CAJA),
  monto: z.number().finite().positive().max(MAX_MONTO),
  descripcion: z.string().trim().min(1).max(140),
  gastoId: uuidSchema.nullable().optional(),
  version: z.number().int().min(1).max(2_147_483_647),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type MovimientoCajaInput = z.infer<typeof movimientoCajaInputSchema>;

export const conteoInventarioInputSchema = z.object({
  id: uuidSchema,
  turnoId: uuidSchema.nullable().optional(),
  productoId: uuidSchema,
  cantidadSistema: z.number().finite().min(0).max(MAX_CANTIDAD),
  cantidadContada: z.number().finite().min(0).max(MAX_CANTIDAD),
  diferencia: z.number().finite().min(-MAX_CANTIDAD).max(MAX_CANTIDAD),
  motivo: z.string().trim().max(140).nullable().optional(),
  usuarioId: uuidSchema.nullable().optional(),
  version: z.number().int().min(1).max(2_147_483_647),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type ConteoInventarioInput = z.infer<typeof conteoInventarioInputSchema>;

export const syncOperationSchema = z.object({
  operationId: uuidSchema,
  tipo: z.string().trim().min(1).max(50),
  timestamp: z.number().int().nonnegative(),
  payload: z.record(z.unknown()),
});

export const syncPushSchema = z.object({
  deviceId: uuidSchema,
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;

export const syncPullQuerySchema = z.object({
  deviceId: uuidSchema,
  // Cursor opaco de paginación. Es un JSON con `{ tabla: { s, id } }` donde
  // `s` es el `updated_at` exacto de Postgres (con microsegundos) y `id` el
  // último identificador entregado de esa tabla. JS Date solo conserva
  // milisegundos, por eso el instante viaja como texto del propio motor.
  cursor: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type SyncPullQueryInput = z.infer<typeof syncPullQuerySchema>;

export const estadoEmpresaSchema = z.enum(EMPRESA_ESTADOS);
export const estadoLicenciaSchema = z.enum(LICENCIA_ESTADOS);
export const estadoDispositivoSchema = z.enum(DISPOSITIVO_ESTADOS);
export const estadoSyncSchema = z.enum(SYNC_ESTADOS);

export const licensePayloadInputSchema = licensePayloadSchema;
