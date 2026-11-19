-- MiCaja platform schema (PostgreSQL / Supabase)
-- Fase 2. Ejecutar con un rol administrador (postgres).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type empresa_estado as enum ('pendiente', 'activa', 'suspendida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type licencia_estado as enum ('pendiente', 'activa', 'vencida', 'suspendida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispositivo_estado as enum ('activo', 'inactivo', 'bloqueado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type usuario_rol as enum ('propietario', 'admin', 'dependiente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type forma_pago as enum ('efectivo', 'transfermovil', 'enzona', 'transferencia', 'mixto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type turno_estado as enum ('abierto', 'cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movimiento_tipo as enum ('inicial', 'venta', 'anulacion', 'entrada', 'salida', 'ajuste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sync_estado as enum ('pendiente', 'aplicada', 'rechazada', 'conflicto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type licencia_evento_tipo as enum ('creada', 'activada', 'renovada', 'suspendida', 'reactivada', 'vencida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_rol as enum ('superadmin', 'operador');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Planes y administración global
-- ---------------------------------------------------------------------------
create table if not exists planes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  max_dispositivos integer,
  features jsonb not null default '[]'::jsonb,
  precio_mensual numeric(12, 2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nombre text not null,
  password_hash text not null,
  rol admin_rol not null default 'operador',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_admin_usuarios_email
  on admin_usuarios (lower(email));

-- ---------------------------------------------------------------------------
-- Empresas, licencias y dispositivos
-- ---------------------------------------------------------------------------
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  propietario text not null,
  email text,
  telefono text,
  estado empresa_estado not null default 'pendiente',
  plan_id uuid references planes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists licencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references empresas(id) on delete cascade,
  plan_id uuid not null references planes(id),
  estado licencia_estado not null default 'pendiente',
  activada_en timestamptz,
  vence_en timestamptz not null,
  grace_dias integer not null default 7 check (grace_dias >= 0),
  features jsonb not null default '[]'::jsonb,
  codigo_activacion_hash text,
  codigo_expira_en timestamptz,
  codigo_usado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);

create table if not exists licencias_eventos (
  id bigserial primary key,
  licencia_id uuid not null,
  empresa_id uuid not null,
  tipo licencia_evento_tipo not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, licencia_id) references licencias(empresa_id, id) on delete cascade
);

create table if not exists dispositivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  plataforma text not null check (plataforma in ('android', 'ios', 'web')),
  app_version text not null default '',
  fingerprint text not null,
  estado dispositivo_estado not null default 'activo',
  licencia_firmada text,
  licencia_emitida_en timestamptz,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, fingerprint),
  unique (empresa_id, id)
);

-- ---------------------------------------------------------------------------
-- Usuarios del negocio
-- ---------------------------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  usuario text not null,
  rol usuario_rol not null default 'dependiente',
  password_hash text,
  activo boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create unique index if not exists ux_usuarios_empresa_usuario
  on usuarios (empresa_id, lower(usuario))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  color text not null default '#E2E8F0',
  orden integer not null default 0,
  activo boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  categoria_id uuid,
  nombre text not null,
  precio numeric(14, 2) not null default 0 check (precio >= 0),
  emoji text not null default '🍽️',
  color text not null default '#0EA5E9',
  imagen text,
  orden integer not null default 0,
  activo boolean not null default true,
  stock_actual numeric(14, 3) not null default 0,
  stock_minimo numeric(14, 3) not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references categorias(empresa_id, id)
);

-- ---------------------------------------------------------------------------
-- Operación: turnos, ventas e inventario
-- ---------------------------------------------------------------------------
create table if not exists turnos_caja (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dispositivo_id uuid not null,
  usuario_id uuid not null,
  apertura timestamptz not null,
  cierre timestamptz,
  estado turno_estado not null default 'abierto',
  fondo_inicial numeric(14, 2) not null default 0,
  ventas_count integer not null default 0,
  total_esperado numeric(14, 2) not null default 0,
  desglose jsonb not null default '{}'::jsonb,
  dinero_real numeric(14, 2),
  diferencia numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, dispositivo_id) references dispositivos(empresa_id, id),
  foreign key (empresa_id, usuario_id) references usuarios(empresa_id, id)
);

create unique index if not exists ux_turnos_abiertos_por_dispositivo
  on turnos_caja (empresa_id, dispositivo_id)
  where estado = 'abierto';

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dispositivo_id uuid not null,
  usuario_id uuid not null,
  turno_id uuid,
  local_id uuid not null,
  numero bigint not null,
  fecha_cliente timestamptz not null,
  fecha_servidor timestamptz not null default now(),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  descuento_pct numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  total numeric(14, 2) not null check (total >= 0),
  forma_pago forma_pago not null,
  monto_efectivo numeric(14, 2) not null default 0,
  monto_digital numeric(14, 2) not null default 0,
  anulada boolean not null default false,
  motivo_anulacion text,
  anulada_por uuid,
  anulada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, numero),
  unique (empresa_id, dispositivo_id, local_id),
  foreign key (empresa_id, dispositivo_id) references dispositivos(empresa_id, id),
  foreign key (empresa_id, usuario_id) references usuarios(empresa_id, id),
  foreign key (empresa_id, turno_id) references turnos_caja(empresa_id, id)
);

create table if not exists venta_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  venta_id uuid not null,
  producto_id uuid,
  nombre text not null,
  precio_unitario numeric(14, 2) not null check (precio_unitario >= 0),
  cantidad numeric(14, 3) not null check (cantidad > 0),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, venta_id) references ventas(empresa_id, id) on delete cascade,
  foreign key (empresa_id, producto_id) references productos(empresa_id, id)
);

create table if not exists movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  producto_id uuid not null,
  tipo movimiento_tipo not null,
  cantidad numeric(14, 3) not null,
  referencia_tipo text,
  referencia_id uuid,
  usuario_id uuid,
  dispositivo_id uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, producto_id) references productos(empresa_id, id),
  foreign key (empresa_id, usuario_id) references usuarios(empresa_id, id),
  foreign key (empresa_id, dispositivo_id) references dispositivos(empresa_id, id)
);

-- ---------------------------------------------------------------------------
-- Configuración, sincronización y auditoría
-- ---------------------------------------------------------------------------
create table if not exists settings (
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave text not null,
  valor jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, clave)
);

create table if not exists contadores (
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  valor bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, nombre)
);

create table if not exists sync_operations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dispositivo_id uuid not null,
  operation_id uuid not null,
  tipo text not null,
  payload jsonb not null,
  estado sync_estado not null default 'pendiente',
  resultado jsonb,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (empresa_id, operation_id),
  foreign key (empresa_id, dispositivo_id) references dispositivos(empresa_id, id)
);

create table if not exists auditoria (
  id bigserial primary key,
  empresa_id uuid references empresas(id) on delete set null,
  actor_tipo text not null,
  actor_id text,
  accion text not null,
  entidad text,
  entidad_id text,
  payload jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index if not exists ix_empresas_estado on empresas (estado);
create index if not exists ix_empresas_plan on empresas (plan_id);

create index if not exists ix_licencias_estado on licencias (estado);
create index if not exists ix_licencias_vence on licencias (vence_en);
create unique index if not exists ux_licencias_codigo_hash
  on licencias (codigo_activacion_hash)
  where codigo_activacion_hash is not null;

create index if not exists ix_dispositivos_empresa on dispositivos (empresa_id, estado);
create index if not exists ix_dispositivos_last_seen on dispositivos (last_seen_at);

create index if not exists ix_usuarios_empresa on usuarios (empresa_id, activo);

create index if not exists ix_categorias_empresa on categorias (empresa_id, activo);
create index if not exists ix_productos_empresa on productos (empresa_id, activo);
create index if not exists ix_productos_categoria on productos (empresa_id, categoria_id);

create index if not exists ix_turnos_empresa on turnos_caja (empresa_id, estado);
create index if not exists ix_turnos_dispositivo on turnos_caja (empresa_id, dispositivo_id);

create index if not exists ix_ventas_empresa_fecha on ventas (empresa_id, fecha_servidor);
create index if not exists ix_ventas_turno on ventas (empresa_id, turno_id);
create index if not exists ix_ventas_usuario on ventas (empresa_id, usuario_id);

create index if not exists ix_venta_items_venta on venta_items (empresa_id, venta_id);
create index if not exists ix_venta_items_producto on venta_items (empresa_id, producto_id);

create index if not exists ix_movimientos_producto on movimientos_inventario (empresa_id, producto_id, created_at);

create index if not exists ix_sync_operations_estado on sync_operations (estado, created_at);
create index if not exists ix_sync_operations_dispositivo on sync_operations (empresa_id, dispositivo_id, created_at);

create index if not exists ix_auditoria_empresa on auditoria (empresa_id, created_at);
create index if not exists ix_auditoria_actor on auditoria (actor_tipo, actor_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'planes', 'admin_usuarios', 'empresas', 'licencias', 'dispositivos',
    'usuarios', 'categorias', 'productos', 'turnos_caja', 'ventas', 'settings'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on %I', tabla, tabla);
    execute format(
      'create trigger trg_%s_updated_at before update on %I for each row execute function set_updated_at()',
      tabla, tabla
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Planes iniciales
-- ---------------------------------------------------------------------------
insert into planes (codigo, nombre, max_dispositivos, features, precio_mensual)
values
  ('basico', 'Básico', 3, '["ventas","inventario"]'::jsonb, 0),
  ('pro', 'Pro', 5, '["ventas","inventario","reportes","backup"]'::jsonb, 0),
  ('empresa', 'Empresa', null, '["ventas","inventario","reportes","backup","multiusuario"]'::jsonb, 0)
on conflict (codigo) do nothing;
