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
});

export type ActivacionInput = z.infer<typeof activacionSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

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
  precio: z.number().min(0),
  emoji: z.string().max(16).default('🍽️'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0EA5E9'),
  imagen: z.string().max(2_000_000).nullable().optional(),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
  stockMinimo: z.number().min(0).default(0),
});

export type ProductoInput = z.infer<typeof productoInputSchema>;

export const ventaItemInputSchema = z.object({
  productoId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precioUnitario: z.number().min(0),
  cantidad: z.number().positive(),
  subtotal: z.number().min(0),
});

export const ventaInputSchema = z.object({
  localId: uuidSchema,
  usuarioId: uuidSchema,
  turnoId: uuidSchema.nullable().optional(),
  fechaCliente: z.string().datetime(),
  subtotal: z.number().min(0),
  descuentoPct: z.number().min(0).max(100).default(0),
  total: z.number().min(0),
  formaPago: z.enum(FORMAS_PAGO),
  montoEfectivo: z.number().min(0).default(0),
  montoDigital: z.number().min(0).default(0),
  items: z.array(ventaItemInputSchema).min(1),
});

export type VentaInput = z.infer<typeof ventaInputSchema>;

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
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type SyncPullQueryInput = z.infer<typeof syncPullQuerySchema>;

export const estadoEmpresaSchema = z.enum(EMPRESA_ESTADOS);
export const estadoLicenciaSchema = z.enum(LICENCIA_ESTADOS);
export const estadoDispositivoSchema = z.enum(DISPOSITIVO_ESTADOS);
export const estadoSyncSchema = z.enum(SYNC_ESTADOS);

export const licensePayloadInputSchema = licensePayloadSchema;
