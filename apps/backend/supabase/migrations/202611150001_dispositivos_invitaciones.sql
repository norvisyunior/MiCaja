-- MiCaja — módulo de cuentas, licencias y dispositivos (2026-11-15)
-- Migración incremental: no elimina ni altera datos existentes.
--
-- 1. Corrige el hueco de RLS que dejaba sin efecto las actualizaciones de
--    `dispositivos` en contexto tenant (heartbeat, last_sync_at).
-- 2. Crea la tabla de invitaciones de trabajadores.

-- ---------------------------------------------------------------------------
-- Dispositivos: el tenant (token de dispositivo de la empresa) puede
-- actualizar sus metadatos y su estado. La creación y el borrado siguen
-- siendo operaciones administrativas (activación).
-- ---------------------------------------------------------------------------
drop policy if exists dispositivos_tenant_update on dispositivos;
create policy dispositivos_tenant_update on dispositivos
  for update using (empresa_id = current_tenant_id())
  with check (empresa_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- Invitaciones de trabajadores
-- Un dispositivo activo del negocio genera un código; el trabajador lo usa
-- en la activación de su propio dispositivo y recibe el rol asignado.
-- ---------------------------------------------------------------------------
do $$ begin
  create table if not exists invitaciones (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references empresas(id) on delete cascade,
    rol usuario_rol not null default 'dependiente',
    codigo_hash text not null unique,
    expira_en timestamptz not null,
    usado_en timestamptz,
    dispositivo_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception when duplicate_object then null; end $$;

create index if not exists ix_invitaciones_empresa
  on invitaciones (empresa_id);

alter table invitaciones enable row level security;
alter table invitaciones force row level security;

drop policy if exists invitaciones_tenant_select on invitaciones;
create policy invitaciones_tenant_select on invitaciones
  for select using (empresa_id = current_tenant_id());

drop policy if exists invitaciones_tenant_insert on invitaciones;
create policy invitaciones_tenant_insert on invitaciones
  for insert with check (empresa_id = current_tenant_id());

drop policy if exists invitaciones_tenant_update on invitaciones;
create policy invitaciones_tenant_update on invitaciones
  for update using (empresa_id = current_tenant_id())
  with check (empresa_id = current_tenant_id());

drop policy if exists invitaciones_admin on invitaciones;
create policy invitaciones_admin on invitaciones
  for all using (is_admin_context()) with check (is_admin_context());
