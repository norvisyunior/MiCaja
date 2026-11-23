-- MiCaja — rentabilidad: costo de mercancía vendida y gastos operativos (2026-11-22)
-- Migración aditiva: no altera ventas existentes ni inventa costos históricos.
-- Las ventas anteriores quedan con costo_unitario = NULL y se reportan como
-- "sin costo registrado" en lugar de estimarse.

select set_config('app.admin', 'true', false);

alter table productos
  add column if not exists costo_unitario numeric(14,2);

alter table venta_items
  add column if not exists costo_unitario numeric(14,2);

do $$ begin
  create table if not exists gastos (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references empresas(id) on delete cascade,
    categoria text not null check (categoria in (
      'transporte', 'servicios', 'salarios', 'alquiler', 'otros'
    )),
    concepto text not null check (char_length(concepto) between 1 and 120),
    monto numeric(14,2) not null check (monto > 0),
    fecha timestamptz not null,
    version integer not null default 1,
    deleted_at timestamptz,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (empresa_id, id)
  );
exception when duplicate_object then null; end $$;

create index if not exists ix_gastos_empresa_fecha on gastos (empresa_id, fecha);

alter table gastos enable row level security;
alter table gastos force row level security;

drop policy if exists gastos_tenant_select on gastos;
create policy gastos_tenant_select on gastos
  for select using (empresa_id = current_tenant_id());

drop policy if exists gastos_tenant_insert on gastos;
create policy gastos_tenant_insert on gastos
  for insert with check (empresa_id = current_tenant_id());

drop policy if exists gastos_tenant_update on gastos;
create policy gastos_tenant_update on gastos
  for update using (empresa_id = current_tenant_id())
  with check (empresa_id = current_tenant_id());

drop policy if exists gastos_admin on gastos;
create policy gastos_admin on gastos
  for all using (is_admin_context()) with check (is_admin_context());
