# Puesta en marcha de Supabase y del backend

## 1. Crear el proyecto

1. Crear un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. Guardar:
   - `DATABASE_URL` del **pooler** (puerto 6543, modo transaction) para la API.
   - `DIRECT_URL` (puerto 5432) para ejecutar migraciones.
3. Ejecutar las migraciones de `apps/backend/supabase/migrations/` en orden desde el SQL Editor o con `psql`.

## 2. Crear el rol de la API con RLS

El backend debe conectarse con un rol **sin privilegios de superusuario y con RLS activo**. En el SQL Editor, como `postgres`:

```sql
create role micaja_api
  login password 'CAMBIA_ESTA_CLAVE'
  nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

grant usage on schema public to micaja_api;
grant select, insert, update, delete on all tables in schema public to micaja_api;
grant usage, select on all sequences in schema public to micaja_api;

alter default privileges in schema public
  grant select, insert, update, delete on tables to micaja_api;
alter default privileges in schema public
  grant usage, select on sequences to micaja_api;
```

Cadena de conexión resultante (pooler):

```
postgresql://micaja_api.CAMBIA_ESTA_CLAVE@<proyecto>.pooler.supabase.com:6543/postgres
```

> No usar `service_role` en la API: ese rol ignora RLS. Si se usa, el aislamiento dependería solo del código.

## 3. Variables de entorno del backend

Copiar `apps/backend/.env.example` a `apps/backend/.env` y completar:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP (por defecto 4000) |
| `DATABASE_URL` | Cadena pooled del rol `micaja_api` |
| `DIRECT_URL` | Cadena directa para migraciones/scripts |
| `JWT_SECRET` | Secreto de al menos 32 caracteres |
| `JWT_EXPIRES_ADMIN` | Ej. `12h` |
| `JWT_EXPIRES_DEVICE` | Ej. `90d` |
| `LICENSE_PRIVATE_KEY` | Clave privada Ed25519 en base64 (PKCS8) |
| `LICENSE_KEY_ID` | Identificador de clave, ej. `v1` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |
| `REGISTRO_VIGENCIA_DIAS` | Días de vigencia para licencias del registro público (por defecto 3650) |
| `NODE_ENV` | `development` o `production` |

## 4. Generar claves de licencia

```bash
cd apps/backend
npm run keys:generate
```

El script imprime:
- **Private key (base64 PKCS8):** va en `LICENSE_PRIVATE_KEY` del backend. Nunca al APK ni al repositorio.
- **Public key (base64 SPKI):** se incorpora en `apps/mobile/src/licencias/verificar.ts` (`CLAVE_PUBLICA_LICENCIA`). Debe coincidir con la clave privada del backend.

### Probar licencias en desarrollo local sin recompilar el APK

La app lleva la clave pública incorporada. Si en local firmas con otra clave
privada, la app rechazaría la licencia. Para no depender de la clave de
producción, en el dispositivo de desarrollo puedes sobrecargarla con un setting:

```sql
-- En la SQLite del dispositivo (por ejemplo con la consola de Expo):
insert or replace into settings (clave, valor) values
  ('licencia_clave_publica', '<PUBLIC_KEY base64 SPKI del backend local>');
```

Con ese setting presente la app verifica contra esa clave; si no existe, usa la
incorporada. En producción el setting no se distribuye, así que la clave válida
es siempre la incorporada.

## 5. Sembrar el primer administrador

```bash
cd apps/backend
npm run seed:admin -- admin@micaja.app 'UnaClaveSegura123'
```

## 6. Ejecutar la API

```bash
cd apps/backend
npm run dev
```

Comprobar:

```bash
curl http://localhost:4000/health
```

## 7. Migraciones

Las migraciones SQL están en `apps/backend/supabase/migrations/`:

| Archivo | Contenido |
|---|---|
| `202611130001_schema.sql` | Tablas, enums, claves, índices y triggers |
| `202611130002_rls.sql` | RLS, políticas y grants |
| `202611150001_dispositivos_invitaciones.sql` | Política de actualización de dispositivos en contexto tenant y tabla `invitaciones` |
| `202611150002_auditoria_tenant.sql` | Permite que los dispositivos registren auditoría de su empresa |
| `202611150003_roles_dispositivos.sql` | Rol del dispositivo, PK compuesta de `movimientos_inventario` y vínculo de invitaciones |
| `202611150004_turnos_pk_empresa.sql` | PK compuesta `(empresa_id, id)` en `turnos_caja` |
| `202611160001_usuarios_globales.sql` | Renombra usuarios duplicados y crea el índice único global de `usuario` para el login por PIN |
| `202611180001_propietario_inicial.sql` | Garantiza un propietario inicial por empresa |
| `202611180002_planes_dispositivos.sql` | Límite de dispositivos: Básico 3 y Pro 5 |

Aplicarlas con Supabase CLI:

```bash
supabase db push
```

o manualmente con `psql "$DIRECT_URL" -f apps/backend/supabase/migrations/<archivo>.sql`, en orden.

## 8. Pruebas

```bash
cd apps/backend
npm test
```

Las pruebas de integración con PostgreSQL se omiten si no existe `DATABASE_URL`.
