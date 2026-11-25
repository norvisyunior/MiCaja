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

Monorepo con cada pieza en su carpeta independiente:

```
MiCaja/
├── apps/
│   ├── mobile/                      # App Expo React Native (App.tsx, src/, assets/)
│   ├── backend/                     # API Express + TypeScript + supabase/migrations/
│   └── admin/                       # Panel React + Vite + TypeScript
├── packages/
│   └── shared/                      # Contratos: tipos, Zod, formato de licencia y sync
├── docs/                            # Arquitectura, modelo, operación
└── .github/workflows/               # CI: build del APK vía EAS
```

`apps/backend/` y `packages/shared/` tienen su propio `package.json`; el paquete compartido se consume con `file:../../packages/shared`. La app móvil no depende de `@micaja/shared` (incluye su propia copia de tipos en `apps/mobile/src/types`). El panel admin consume la API con JWT de administrador y se sirve como SPA desde Vercel.

### Panel admin

- `apps/admin` usa `VITE_API_URL` (por defecto `http://localhost:4000`) y guarda el JWT en `localStorage`.
- Rutas: resumen, empresas, ficha de empresa, licencias y ficha de licencia.
- Acciones: alta de empresa con código, edición de datos, activación directa, generación de códigos, renovación por código y suspensión/reactivación.
- La activación directa (`POST /api/admin/licencias/:id/activar`) no requiere canje: fija vigencia, activa la empresa pendiente y re-firma los tokens de las terminales.
- Endpoints de apoyo: `GET /api/admin/resumen`, `GET /api/admin/planes` y `GET /api/admin/licencias/:id/eventos`.

## 3. Flujos principales

### 3.1 Alta de empresa y licencia

1. Un administrador de plataforma crea la empresa en MiCaja Admin.
2. Genera una licencia con plan, duración y límite de dispositivos.
3. La API devuelve un **código de activación corto** (se guarda solo su hash).
4. El cliente instala la app, escribe el código y el nombre del dispositivo.
5. La API valida el código, registra el dispositivo y emite una **licencia firmada** vinculada a ese dispositivo.
6. La app guarda licencia y token de dispositivo en almacenamiento seguro.

El registro público (`POST /api/registro`) automatiza los pasos 1–3 para el autoservicio: crea empresa + licencia con el plan **básico** (los planes superiores solo los asigna el panel), devuelve el código y la app se activa sola. La vigencia de esas licencias se configura con `REGISTRO_VIGENCIA_DIAS`.

### 3.2 Operación offline

1. Cada mutación local (venta, anulación, movimiento de stock, cierre) se escribe en SQLite.
2. En la **misma transacción** se inserta una operación en `sync_outbox` con `operation_id` UUID.
3. La UI continúa sin esperar red.
4. La licencia se valida localmente con la clave pública antes de operaciones comerciales.

### 3.3 Sincronización

1. `useSyncAutomatico` escucha la reconexión (`expo-network`), el retorno a primer plano y la visibilidad de la pestaña; además reintenta cada 60 s. Cualquier usuario con dispositivo activo puede empujar sus ventas, movimientos, turnos y settings; el rol del dispositivo ya no restringe `settings_upsert`.
2. `POST /v1/sync/push` es idempotente por `(empresa_id, operation_id)`.
3. El servidor valida, aplica y responde el resultado por operación.
4. El dispositivo marca las operaciones confirmadas y las elimina del outbox.
5. `GET /v1/sync/pull?cursor=<opaco>` descarga cambios de catálogo, settings, licencia **y el historial de operación** (turnos, ventas y sus líneas) con tombstones. Pagina por tabla con `limit` y devuelve `hayMas` y `cursor`: un JSON interno `{ tabla: { s, id } }` donde `s` es el `updated_at` exacto de Postgres, microsegundos incluidos. El instante no se convierte a `Date` en el cliente (perdería precisión y repetiría la página); la app solo devuelve el cursor tal cual y lo persiste en `sync_meta` para no perder ni duplicar filas con el mismo `updated_at`.
6. Ventas y anulaciones se reconcilian como operaciones inmutables/compensatorias; el stock se reconstruye desde el libro de movimientos.
7. **Hidratación al entrar:** tras un login global (dispositivo nuevo o cambio de negocio) la app sincroniza antes de mostrar la caja. `restablecerDispositivo` limpia los datos del negocio anterior y el pull reconstruye catálogo, usuarios, turnos e historial desde el servidor. Las pantallas se refrescan al cambiar `ultimaSync`, no solo al recuperar el foco.
8. **Foto inicial (adopción):** la primera sync tras activar encola el snapshot local (usuarios → categorías → productos → settings) para que las llaves foráneas de turnos/ventas se resuelvan en el servidor. Corre una sola vez por instalación (marca en settings) y omite entidades con operaciones vivas en el outbox.
9. **Prioridades:** upserts de catálogo (1) salen antes que movimientos y aperturas de turno (2) y que ventas/cierres/anulaciones (3); dentro del mismo nivel, por fecha de creación. El servidor aplica cada lote en orden, así que las dependencias por FK se resuelven solas.
10. **Rechazadas:** una operación inválida queda `fallida` local (sin reintento automático). El botón *Reintentar las N con error* la reencola con un `operation_id` nuevo — el servidor archiva el resultado de cada id, y los appliers son idempotentes por entidad (turno por id, venta por `local_id`, anulaciones por bandera), así que no hay riesgo de duplicados. Antes de reencolar, las ventas rechazadas por `TURNO_OTRO_DISPOSITIVO` se reasignan al turno abierto de este dispositivo (se crea si hace falta) para que el reintento no repita el mismo rechazo.
11. **Caja por dispositivo:** el turno abierto que usa la app debe coincidir con el `device_id` local o con el `device_servidor_id` de esta instalación. El pull trae los turnos de otras terminales para el historial, pero nunca se vende ni se cierra en ellos: el servidor lo rechazaría y descuadraría la caja de la otra terminal. Al entrar en un teléfono nuevo se abre una caja propia.
12. **Stock:** el `producto_upsert` lleva el stock absoluto ya compensado con los deltas de operaciones pendientes (ventas/anulaciones/movimientos aún no aplicados), de modo que el servidor converge al valor local sin dobles descuentos.

### 3.4 Vencimiento de licencia

- La app verifica firma, empresa, dispositivo y fechas localmente.
- Al vencer: bloquea ventas y cierres, **conserva todos los datos** y permite consultar historial.
- Si hay periodo de gracia configurado, se informa y se permite operar hasta `grace_until`.
- La renovación se refleja al sincronizar o al consultar `GET /api/device/licencia`.
- Sin licencia activada (`sin_licencia`) la caja tampoco opera: se puede configurar y vender nada más activar. Los datos y el historial siguen accesibles.
- **El servidor manda:** `push` y `pull` exigen licencia vigente y empresa/dispositivo activos. Si responde `LICENCIA_SUSPENDIDA`, `LICENCIA_VENCIDA` o `DISPOSITIVO_INACTIVO`, la app marca su licencia local como inválida y el bloqueo entra en vigor sin esperar al vencimiento del token. Al suspender desde el panel se borran los tokens firmados de todos los dispositivos; al reactivar o cambiar plan/vigencia se re-firman con los datos nuevos.

### 3.5 Dispositivos e invitaciones de trabajadores

1. Cada empresa puede tener hasta `planes.max_dispositivos` dispositivos `activo` (NULL = sin límite).
2. **Reemplazo:** cuando no quedan plazas, la activación acepta `reemplazarA` (id del dispositivo que se pierde o avería) y el anterior queda `inactivo` sin licencia firmada. Solo el código del propietario puede reemplazar; una invitación no.
3. **Desvincular:** desde Ajustes → Sincronización el dueño ve los dispositivos del negocio. El propio dispositivo se retira sin más y la app olvida su activación (conserva los datos y vuelve a pedir un código); para retirar otro se exige el código de activación vigente del negocio.
4. **Invitaciones:** un dispositivo activo genera un código de un solo uso (`POST /api/device/invitaciones`) con rol `dependiente` o `admin` y caducidad (72 h por defecto). El trabajador lo escribe en la activación de su instalación; el servidor valida el hash, registra su dispositivo, consume la invitación y devuelve el rol en la respuesta.
5. Tras una activación por invitación la app **no** pide los datos del negocio: pide crear la cuenta local del trabajador (`TrabajadorSetupScreen`) y el catálogo llega con el `pull`.
6. **Una instalación, un negocio:** cada huella de dispositivo pertenece a una sola empresa. Intentar activar el mismo teléfono con el código de otro negocio devuelve `DISPOSITIVO_OTRA_EMPRESA`; para reutilizarlo hay que borrar los datos de la app o restaurar un respaldo, y así nunca se mezclan catálogos ni ventas entre negocios.

### 3.6 Login global por usuario y PIN

1. **Nombre de usuario único global:** `ux_usuarios_usuario_global` sobre `lower(usuario) WHERE deleted_at IS NULL`. Si una migración encuentra duplicados históricos entre empresas, los renombra con un sufijo de empresa e id antes de crear el índice.
2. **El hash del PIN viaja en `usuario_upsert`:** la app envía `pinHash` (formato `sha256it$…` o `sha256$…`), nunca el PIN en texto claro. El servidor lo guarda en `usuarios.password_hash` y lo omite del `pull`. Si una instalación intenta crear otro usuario con un nombre ya usado, la operación se rechaza con `USUARIO_DUPLICADO` sin abortar el resto del push.
3. **`POST /api/auth/usuario`** valida usuario + PIN sin conocer la empresa. Devuelve token de dispositivo, licencia firmada, empresa, dispositivo y datos del usuario. Está limitado por IP para que el PIN de 4 dígitos no se pueda recorrer por fuerza bruta.
4. **Aprovisionamiento:** si la huella ya existe, se reutiliza el dispositivo (aunque esté inactivo/bloqueado se rechaza y se pide activación). Si es nueva, un `dependiente` necesita invitación; `propietario`/`admin` pueden ocupar una plaza libre y solo el propietario puede reemplazar un dispositivo cuando el plan está lleno.
5. **Huella web:** una instalación web ya activada conserva su `device_id`; una instalación nueva usa un hash estable de navegador/pantalla/zona horaria. La huella con la que se inició sesión se guarda localmente para que los siguientes logins reutilicen el mismo dispositivo. En Android/iOS se mantiene el id aleatorio local.
6. **Fallback híbrido:** el login intenta primero la cuenta local. Si no existe, el PIN local no coincide sin bloqueo o la cuenta local está inactiva, consulta la nube; si valida, crea/actualiza la cuenta local, guarda la activación, marca el snapshot como descargado y sincroniza. Un bloqueo local no se salta por la nube.
7. **Sin mezclar negocios:** si la SQLite ya tiene usuarios/ventas locales o pertenece a otra empresa, el login global se rechaza y pide borrar los datos o usar otro dispositivo.

## 4. Seguridad

- **Contraseñas administrativas:** bcrypt (coste 12) y JWT con audiencia `micaja-admin`.
- **PIN:** se guarda su hash con sal y 1000 rondas de SHA-256 (`sha256it$…`) tanto en la SQLite local como en `usuarios.password_hash` para el login global; los PIN antiguos en texto plano o con una sola pasada se migran solos. El PIN en claro nunca sale del dispositivo.
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

La app incluye la clave pública SPKI (base64) y verifica con Ed25519 usando `tweetnacl`, sin dependencias nativas nuevas. Al vencer o invalidarse la licencia, la app bloquea ventas, apertura y cierre de turnos, conserva los datos y sigue permitiendo consultar historial y reportes. La verificación está cubierta por pruebas unitarias (`apps/mobile/src/licencias/*.test.ts`).

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
| 7. Panel admin | Completado: `apps/admin` con resumen, empresas, licencias, códigos, activación directa y auditoría visible |
| 8. Login global | Completado: `usuario` único global, PIN hasheado en servidor, login por huella, reemplazo de dispositivos y fallback offline-first, con pruebas E2E |
| 9. Pruebas integrales | Completada la base: pruebas de unidad de app, backend y contratos, más E2E contra PostgreSQL local (activación, sync, registro, dispositivos, invitaciones, login global y suspensión) |
| 10. Producción | Pendiente |
