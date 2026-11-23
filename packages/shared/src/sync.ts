export const SYNC_OPERATION_TYPES = [
  'venta',
  'anulacion',
  'turno_apertura',
  'turno_cierre',
  'movimiento_inventario',
  'producto_upsert',
  'categoria_upsert',
  'usuario_upsert',
  'settings_upsert',
  'gasto_upsert',
  'movimiento_caja_upsert',
  'conteo_inventario_upsert',
] as const;

export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export interface SyncOperation<T = unknown> {
  operationId: string;
  tipo: SyncOperationType;
  timestamp: number;
  payload: T;
}

export interface SyncPushRequest {
  deviceId: string;
  operations: SyncOperation[];
}

export type SyncResultado = 'aplicada' | 'rechazada' | 'conflicto';

export interface SyncOperationResult {
  operationId: string;
  estado: SyncResultado;
  error?: string;
  resultado?: unknown;
}

export interface SyncPushResponse {
  results: SyncOperationResult[];
  serverTime: string;
}

export interface SyncCambio<T = unknown> {
  tipo: string;
  id: string;
  version?: number;
  updatedAt: string;
  data: T;
}

export interface SyncPullResponse<T = unknown> {
  cambios: SyncCambio<T>[];
  serverTime: string;
}

export interface SyncPullQuery {
  deviceId: string;
  since?: string;
  limit?: number;
}

export const SYNC_CONFLICT_POLICIES: Record<SyncOperationType, string> = {
  venta: 'inmutable: no se edita; se anula con operación compensatoria',
  anulacion: 'idempotente por operation_id; una venta anulada no se reanula',
  turno_apertura: 'un solo turno abierto por dispositivo (índice parcial)',
  turno_cierre: 'cierre idempotente; no se reabre un turno cerrado',
  movimiento_inventario: 'libro inmutable; nunca se actualiza ni elimina',
  producto_upsert: 'gana la versión mayor; empate gana fecha_servidor',
  categoria_upsert: 'gana la versión mayor; empate gana fecha_servidor',
  usuario_upsert: 'gana la versión mayor; empate gana fecha_servidor',
  settings_upsert: 'gana la versión mayor; empate gana fecha_servidor',
  gasto_upsert: 'gana la versión mayor; borrado lógico con deletedAt',
  movimiento_caja_upsert: 'idempotente por id; borrado lógico con deletedAt',
  conteo_inventario_upsert: 'idempotente por id; borrado lógico con deletedAt',
};
