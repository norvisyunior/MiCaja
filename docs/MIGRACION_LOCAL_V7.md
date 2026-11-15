# Migración local SQLite v7 — implementada

> Fase 4 completada. `apps/mobile/src/db/migraciones.ts` aplica esta estructura de forma aditiva e idempotente. La app puede seguir funcionando sin conexión y sin licencia.

## 1. Objetivo

Convertir la base local monoempresa en una base preparada para identidad, licencia y sincronización, **sin perder datos ni funcionalidades**:

- Asignar los datos existentes a una empresa y un dispositivo locales.
- Añadir UUIDs estables para sincronizar.
- Crear cola de salida (`sync_outbox`) y metadatos de sync.
- Guardar la licencia firmada y el estado del dispositivo.
- Mantener el PIN local como acceso offline.

## 2. Identidad local y del servidor

La identidad local se genera en el primer arranque tras actualizar:

1. Generar `empresa_id` y `device_id` con UUID v4 (`expo-crypto`).
2. Guardarlos en `settings` (`empresa_id`, `device_id`).
3. Asignar `empresa_id` a todas las filas existentes.
4. Generar `uuid` para filas sincronizables existentes.

Al activar el dispositivo, los IDs del servidor se guardan aparte y **no reemplazan** los IDs locales:

- `empresa_servidor_id`
- `device_servidor_id`
- `device_token`
- `licencia_token`
- `sync_server_url`
- `nombre_dispositivo`
- `licencia_verificada_en`
- `ultimo_sync_en`

El outbox usa los UUID locales; la API usa el `device_servidor_id`. Las ventas guardan `servidor_id` y `numero_servidor` cuando el push las confirma.

## 3. DDL aplicado

La migración es aditiva. `asegurarEstructuraV7` comprueba columnas y tablas antes de crearlas, por lo que también repara bases intermedias y backups restaurados.

```sql
-- Columnas de tenant/sync en tablas existentes
ALTER TABLE usuarios    ADD COLUMN uuid TEXT;
ALTER TABLE usuarios    ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios    ADD COLUMN updated_at TEXT;
ALTER TABLE usuarios    ADD COLUMN deleted_at TEXT;
ALTER TABLE usuarios    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE categorias  ADD COLUMN uuid TEXT;
ALTER TABLE categorias  ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';
ALTER TABLE categorias  ADD COLUMN updated_at TEXT;
ALTER TABLE categorias  ADD COLUMN deleted_at TEXT;
ALTER TABLE categorias  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE productos   ADD COLUMN uuid TEXT;
ALTER TABLE productos   ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';
ALTER TABLE productos   ADD COLUMN updated_at TEXT;
ALTER TABLE productos   ADD COLUMN deleted_at TEXT;
ALTER TABLE productos   ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE turnos_caja ADD COLUMN uuid TEXT;
ALTER TABLE turnos_caja ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';
ALTER TABLE turnos_caja ADD COLUMN device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE turnos_caja ADD COLUMN updated_at TEXT;

ALTER TABLE ventas      ADD COLUMN uuid TEXT;
ALTER TABLE ventas      ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ventas      ADD COLUMN device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ventas      ADD COLUMN updated_at TEXT;
ALTER TABLE ventas      ADD COLUMN servidor_id TEXT;
ALTER TABLE ventas      ADD COLUMN numero_servidor INTEGER;

ALTER TABLE venta_items ADD COLUMN uuid TEXT;
ALTER TABLE venta_items ADD COLUMN empresa_id TEXT NOT NULL DEFAULT '';

ALTER TABLE settings    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings    ADD COLUMN updated_at TEXT;

-- Relleno de UUIDs y empresa/dispositivo con expo-crypto.
-- Los valores se asignan fila por fila desde `rellenarUuids`.

-- El índice único de usuario pasa a ser parcial para permitir reutilizar
-- un nombre cuando el usuario anterior fue eliminado lógicamente.
DROP INDEX IF EXISTS idx_usuarios_usuario;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_activo
  ON usuarios(usuario COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_uuid    ON usuarios(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_uuid  ON categorias(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_uuid   ON productos(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_uuid      ON turnos_caja(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_uuid      ON ventas(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_local     ON ventas(device_id, uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venta_items_uuid ON venta_items(uuid);
CREATE INDEX IF NOT EXISTS idx_productos_empresa       ON productos(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha    ON ventas(empresa_id, fecha_iso);

-- Cola de salida
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_uuid TEXT,
  payload TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  intentos INTEGER NOT NULL DEFAULT 0,
  siguiente_intento TEXT,
  ultimo_error TEXT,
  prioridad INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  UNIQUE (empresa_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_outbox_pendiente
  ON sync_outbox(estado, siguiente_intento, created_at);

-- Metadatos de sincronización
CREATE TABLE IF NOT EXISTS sync_meta (
  entidad TEXT PRIMARY KEY,
  server_seq INTEGER NOT NULL DEFAULT 0,
  ultima_sync TEXT
);

-- Registro local del dispositivo y su licencia
CREATE TABLE IF NOT EXISTS dispositivo_local (
  device_id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  app_version TEXT NOT NULL,
  activado_en TEXT,
  last_sync_at TEXT
);

CREATE TABLE IF NOT EXISTS licencia_local (
  license_id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  device_id TEXT,
  plan TEXT NOT NULL,
  features TEXT NOT NULL,
  activada_en TEXT,
  vence_en TEXT NOT NULL,
  grace_until TEXT,
  key_id TEXT NOT NULL,
  token TEXT NOT NULL,
  ultima_verificacion TEXT,
  estado TEXT NOT NULL DEFAULT 'activa'
);

-- Libro de inventario local
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  producto_id INTEGER NOT NULL,
  producto_uuid TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cantidad REAL NOT NULL,
  referencia_tipo TEXT,
  referencia_id TEXT,
  usuario_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movimientos_producto
  ON movimientos_inventario(producto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movimientos_referencia
  ON movimientos_inventario(referencia_tipo, referencia_id);

PRAGMA user_version = 7;
```

El índice parcial de usuario se crea dentro de `try/catch`: si un backup antiguo trae usuarios duplicados, la app sigue arrancando y los usuarios se pueden corregir desde Ajustes.

## 4. Cambios en la capa de datos

- Los repositorios reciben `empresa_id` y `device_id` desde `apps/mobile/src/db/contexto.ts`.
- Cada escritura sincronizable y su registro en `sync_outbox` van en la misma transacción.
- Las ventas usan `uuid` local como `local_id` y no dependen de `AUTOINCREMENT` para sincronizar.
- El stock se calcula con el libro `movimientos_inventario`; `producto_upsert` no modifica stock en el servidor.
- Prioridades del outbox: 1 catálogo/usuarios/settings, 2 stock inicial/ajustes, 3 ventas/turnos/anulaciones.
- Las eliminaciones de catálogo y usuarios son lógicas (`deleted_at`) y se sincronizan como upsert.
- Las imágenes siguen en SQLite; se valorará almacenamiento externo en fases posteriores.
- El backup v2 incluye `empresa_id`, `device_id`, licencia, outbox y movimientos; es restaurable sin conexión.
- Al restaurar un backup v1 se conservan los IDs locales, token de dispositivo, IDs del servidor, URL y licencia previos.

## 5. Compatibilidad

- La migración no elimina tablas ni columnas.
- Los datos actuales se conservan y quedan asignados a la empresa local.
- `empresa_id` local no se sobrescribe con el UUID del servidor; el mapeo vive en `empresa_servidor_id`.
- La licencia se verifica offline con Ed25519 (`tweetnacl`). Sin licencia, la caja funciona en modo local; una licencia inválida no bloquea el POS.
- La clave pública de la app debe corresponder a la `LICENSE_PRIVATE_KEY` del backend. La clave incluida es de desarrollo y debe reemplazarse en producción.
