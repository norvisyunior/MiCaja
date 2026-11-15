# Arquitectura de la plataforma MiCaja

> Fase 2 — Diseño aprobado a partir de la auditoría técnica de la Fase 1.

## 1. Principios

1. **No reescribir el POS.** La aplicación móvil actual se conserva y se le añaden capas de identidad, licencia y sincronización.
2. **Offline-first real.** La SQLite local sigue siendo la fuente operativa inmediata. Ninguna venta depende de Internet.
3. **El servidor manda en lo crítico.** Totales, numeración, stock e idempotencia se validan y consolidan en el backend.
4. **Aislamiento por empresa.** Toda entidad de negocio lleva `empresa_id`. RLS en PostgreSQL como segunda barrera.
5. **Licencia verificable sin Internet.** Firma Ed25519; la app solo incorpora la clave pública.
6. **Complejidad interna, experiencia simple.** El usuario instala, activa con una clave, configura su negocio y vende.

## 2. Componentes

```
┌─────────────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│ App móvil MiCaja            │ ───────────────────────▶ │ API MiCaja               │
│ Expo / React Native         │ ◀─────────────────────── │ Node.js + Express + TS   │
│ SQLite local + outbox       │                          │ Render                   │
│ Licencia firmada offline    │                          └────────────┬─────────────┘
└─────────────────────────────┘                                       │ pg (pooled)
                                                                      ▼
┌─────────────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│ MiCaja Admin                │ ───────────────────────▶ │ PostgreSQL (Supabase)    │
│ React + Vite + TS           │                          │ RLS + auditoría          │
│ Vercel                      │                          └──────────────────────────┘
└─────────────────────────────┘
```

### Repositorio

La app móvil permanece en la raíz para no romper EAS. Se añaden carpetas independientes:

```
MiCaja/
├── App.tsx, src/, assets/        # App móvil actual (sin mover)
├── backend/                      # API Express + TypeScript
├── shared/                       # Contratos: tipos, Zod, formato de licencia y sync
├── supabase/migrations/          # Esquema PostgreSQL versionado
├── vitest/                       # Stubs de React Native para probar la app en Node
├── docs/                         # Arquitectura, modelo, operación
└── .github/workflows/            # CI: pruebas, typecheck y build
```

`backend/` y `shared/` tienen su propio `package.json`; el paquete compartido se consume con `file:../shared`.

## 3. Flujos principales

### 3.1 Alta de empresa y licencia

1. Un administrador de plataforma crea la empresa en MiCaja Admin.
2. Genera una licencia con plan, duración y límite de dispositivos.
3. La API devuelve un **código de activación corto** (se guarda solo su hash).
4. El cliente instala la app, escribe el código y el nombre del dispositivo.
5. La API valida el código, registra el dispositivo y emite una **licencia firmada** vinculada a ese dispositivo.
6. La app guarda licencia y token de dispositivo en almacenamiento seguro.

### 3.2 Operación offline

1. Cada mutación local (venta, anulación, movimiento de stock, cierre) se escribe en SQLite.
2. En la **misma transacción** se inserta una operación en `sync_outbox` con `operation_id` UUID.
3. La UI continúa sin esperar red.
4. La licencia se valida localmente con la clave pública antes de operaciones comerciales.

### 3.3 Sincronización

1. Al recuperar conectividad o volver a primer plano, el motor de sync envía el outbox por lotes.
2. `POST /v1/sync/push` es idempotente por `(empresa_id, operation_id)`.
3. El servidor valida, aplica y responde el resultado por operación.
4. El dispositivo marca las operaciones confirmadas y las elimina del outbox.
5. `GET /v1/sync/pull?since=<secuencia>` descarga cambios de catálogo, settings y licencia con tombstones.
6. Ventas y anulaciones se reconcilian como operaciones inmutables/compensatorias; el stock se reconstruye desde el libro de movimientos.
7. **Foto inicial (adopción):** la primera sync tras activar encola el snapshot local (usuarios → categorías → productos → settings) para que las llaves foráneas de turnos/ventas se resuelvan en el servidor. Corre una sola vez por instalación (marca en settings) y omite entidades con operaciones vivas en el outbox.
8. **Prioridades:** upserts de catálogo (1) salen antes que movimientos (2) y que turnos/ventas/anulaciones (3); dentro del mismo nivel, por fecha de creación. El servidor aplica cada lote en orden, así que las dependencias por FK se resuelven solas.
9. **Rechazadas:** una operación inválida queda `fallida` local (sin reintento automático). El botón *Reintentar las N con error* la reencola con un `operation_id` nuevo — el servidor archiva el resultado de cada id, y los appliers son idempotentes por entidad (turno por id, venta por `local_id`, anulaciones por bandera), así que no hay riesgo de duplicados.
10. **Stock:** el `producto_upsert` lleva el stock absoluto ya compensado con los deltas de operaciones pendientes (ventas/anulaciones/movimientos aún no aplicados), de modo que el servidor converge al valor local sin dobles descuentos.

### 3.4 Vencimiento de licencia

- La app verifica firma, empresa, dispositivo y fechas localmente.
- Al vencer: bloquea ventas y cierres, **conserva todos los datos** y permite consultar historial.
- Si hay periodo de gracia configurado, se informa y se permite operar hasta `grace_until`.
- La renovación se refleja al sincronizar o al consultar `GET /v1/dispositivo/licencia`.

## 4. Seguridad

- **Contraseñas administrativas:** bcrypt (coste 12) y JWT con audiencia `micaja-admin`.
- **Dispositivos:** token JWT con audiencia `micaja-device`, vinculado a `empresa_id` y `device_id`.
- **Aislamiento:** `SET LOCAL app.tenant_id` por transacción + políticas RLS.
- **Administración:** `SET LOCAL app.admin = 'true'` solo en rutas de admin autenticadas.
- **Validación:** Zod en todos los cuerpos, parámetros y consultas.
- **Rate limiting:** login admin y activación de dispositivos.
- **Auditoría:** toda acción administrativa y de activación queda registrada.
- **Secretos:** solo en variables de entorno del backend. La clave privada de licencias nunca viaja al APK.
- **Backups:** cifrados en reposo y fuera del repositorio.

## 5. Licencias firmadas

Formato compacto:

```
<base64url(payload)>.<base64url(firma_ed25519)>
```

Payload:

```json
{
  "v": 1,
  "licenseId": "uuid",
  "empresaId": "uuid",
  "deviceId": "uuid",
  "plan": "basico",
  "features": ["ventas", "inventario", "reportes"],
  "iat": 1760000000,
  "exp": 1791536000,
  "graceUntil": 1792130800,
  "keyId": "v1"
}
```

La app incluye la clave pública SPKI (base64) y verifica con Ed25519 usando `tweetnacl`, sin dependencias nativas nuevas. Al vencer o invalidarse la licencia, la app bloquea ventas, apertura y cierre de turnos, conserva los datos y sigue permitiendo consultar historial y reportes. La verificación está cubierta por pruebas unitarias (`src/licencias/*.test.ts`).

## 6. Infraestructura gratuita

| Servicio | Uso | Límite a vigilar |
|---|---|---|
| Supabase | PostgreSQL gestionado | Conexiones: usar pooler (Supavisor) |
| Render | API Express | Suspensión por inactividad en plan free |
| Vercel | Panel admin | Ancho de banda y builds |
| GitHub Actions | CI y build APK | Minutos gratuitos |
| EAS Build | APK Android | Cola y builds gratuitos limitados |

## 7. Fases

| Fase | Estado |
|---|---|
| 1. Auditoría | Completada |
| 2. Diseño multiempresa | Completada con este documento, modelo y migraciones |
| 3. Backend central | Completada la base: auth admin, empresas, licencias, activación, sync idempotente y registro público, con pruebas de unidad |
| 4. Adaptación móvil | Completada: migración local v7, bienvenida, registro y activación desde la app |
| 5. Sincronización multidispositivo | Completada: outbox local, push/pull idempotente y reconciliación de stock por movimientos |
| 6. Licencias en la app | Completada: verificación Ed25519 local y bloqueo de ventas y turnos al vencer o invalidarse |
| 7. Panel admin | Pendiente |
| 8. Pruebas integrales | En curso: pruebas de unidad del backend y de la lógica pura de la app; flujo E2E con base de datos pendiente |
| 9. Producción | Pendiente |
