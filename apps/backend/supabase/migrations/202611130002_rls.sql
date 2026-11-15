-- MiCaja — Row Level Security (RLS)
-- El backend debe ejecutar SET LOCAL app.tenant_id = '<uuid>' o
-- SET LOCAL app.admin = 'true' dentro de cada transacción.

create or replace function current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function is_admin_context()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.admin', true), 'false') = 'true'
$$;

-- ---------------------------------------------------------------------------
-- Habilitar y forzar RLS
-- ---------------------------------------------------------------------------
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'planes', 'admin_usuarios', 'empresas', 'licencias', 'licencias_eventos',
    'dispositivos', 'usuarios', 'categorias', 'productos', 'turnos_caja',
    'ventas', 'venta_items', 'movimientos_inventario', 'settings',
    'contadores', 'sync_operations', 'auditoria'
  ] loop
    execute format('alter table %I enable row level security', tabla);
    execute format('alter table %I force row level security', tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Planes: lectura general, escritura administrativa
-- ---------------------------------------------------------------------------
drop policy if exists planes_select on planes;
create policy planes_select on planes
  for select using (true);

drop policy if exists planes_admin on planes;
create policy planes_admin on planes
  for all using (is_admin_context()) with check (is_admin_context());

-- ---------------------------------------------------------------------------
-- Administración global
-- ---------------------------------------------------------------------------
drop policy if exists admin_usuarios_admin on admin_usuarios;
create policy admin_usuarios_admin on admin_usuarios
  for all using (is_admin_context()) with check (is_admin_context());

drop policy if exists auditoria_admin on auditoria;
create policy auditoria_admin on auditoria
  for all using (is_admin_context()) with check (is_admin_context());

-- ---------------------------------------------------------------------------
-- Empresas y licencias: el tenant solo lee lo suyo
-- ---------------------------------------------------------------------------
drop policy if exists empresas_tenant_select on empresas;
create policy empresas_tenant_select on empresas
  for select using (id = current_tenant_id());

drop policy if exists empresas_admin on empresas;
create policy empresas_admin on empresas
  for all using (is_admin_context()) with check (is_admin_context());

drop policy if exists licencias_tenant_select on licencias;
create policy licencias_tenant_select on licencias
  for select using (empresa_id = current_tenant_id());

drop policy if exists licencias_admin on licencias;
create policy licencias_admin on licencias
  for all using (is_admin_context()) with check (is_admin_context());

drop policy if exists licencias_eventos_tenant_select on licencias_eventos;
create policy licencias_eventos_tenant_select on licencias_eventos
  for select using (empresa_id = current_tenant_id());

drop policy if exists licencias_eventos_admin on licencias_eventos;
create policy licencias_eventos_admin on licencias_eventos
  for all using (is_admin_context()) with check (is_admin_context());

drop policy if exists dispositivos_tenant_select on dispositivos;
create policy dispositivos_tenant_select on dispositivos
  for select using (empresa_id = current_tenant_id());

drop policy if exists dispositivos_admin on dispositivos;
create policy dispositivos_admin on dispositivos
  for all using (is_admin_context()) with check (is_admin_context());

-- ---------------------------------------------------------------------------
-- Datos operativos: el tenant gestiona lo suyo
-- ---------------------------------------------------------------------------
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'usuarios', 'categorias', 'productos', 'turnos_caja', 'ventas',
    'venta_items', 'settings', 'contadores', 'sync_operations'
  ] loop
    execute format('drop policy if exists %I on %I', tabla || '_tenant_all', tabla);
    execute format(
      'create policy %I on %I for all using (empresa_id = current_tenant_id()) with check (empresa_id = current_tenant_id())',
      tabla || '_tenant_all', tabla
    );

    execute format('drop policy if exists %I on %I', tabla || '_admin_all', tabla);
    execute format(
      'create policy %I on %I for all using (is_admin_context()) with check (is_admin_context())',
      tabla || '_admin_all', tabla
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventario: libro inmutable para el tenant
-- ---------------------------------------------------------------------------
drop policy if exists movimientos_inventario_tenant_select on movimientos_inventario;
create policy movimientos_inventario_tenant_select on movimientos_inventario
  for select using (empresa_id = current_tenant_id());

drop policy if exists movimientos_inventario_tenant_insert on movimientos_inventario;
create policy movimientos_inventario_tenant_insert on movimientos_inventario
  for insert with check (empresa_id = current_tenant_id());

drop policy if exists movimientos_inventario_admin on movimientos_inventario;
create policy movimientos_inventario_admin on movimientos_inventario
  for all using (is_admin_context()) with check (is_admin_context());
