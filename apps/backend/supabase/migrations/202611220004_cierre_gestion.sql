-- MiCaja — cierre guiado, caja y conteo físico (2026-11-22)
-- Migración aditiva: conserva turnos, ventas, gastos e inventario existentes.

select set_config('app.admin', 'true', false);

alter table turnos_caja
  add column if not exists fondo_inicial numeric(14,2) not null default 0,
  add column if not exists efectivo_esperado numeric(14,2) not null default 0,
  add column if not exists observacion_diferencia text;

alter table ventas
  add column if not exists reembolso_efectivo numeric(14,2) not null default 0,
  add column if not exists reembolso_digital numeric(14,2) not null default 0;

alter table gastos
  add column if not exists forma_pago text not null default 'efectivo',
  add column if not exists movimiento_caja_id uuid;

alter table movimientos_inventario
  add column if not exists turno_id uuid;

do $$ begin
  alter table gastos drop constraint if exists gastos_categoria_check;
  alter table gastos add constraint gastos_categoria_check
    check (categoria in ('transporte','servicios','salarios','electricidad','alquiler','otros'));
exception when duplicate_object then null; end $$;

do $$ begin
  create table if not exists movimientos_caja (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references empresas(id) on delete cascade,
    turno_id uuid,
    usuario_id uuid,
    dispositivo_id uuid,
    tipo text not null check (tipo in ('entrada','retiro','gasto','otra_salida')),
    monto numeric(14,2) not null check (monto > 0),
    descripcion text not null check (char_length(descripcion) between 1 and 140),
    gasto_id uuid,
    version integer not null default 1,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (empresa_id, id)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create table if not exists conteos_inventario (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references empresas(id) on delete cascade,
    turno_id uuid,
    producto_id uuid not null,
    cantidad_sistema numeric(14,2) not null,
    cantidad_contada numeric(14,2) not null,
    diferencia numeric(14,2) not null,
    motivo text,
    usuario_id uuid,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (empresa_id, id)
  );
exception when duplicate_object then null; end $$;

create index if not exists ix_movimientos_caja_empresa_turno
  on movimientos_caja (empresa_id, turno_id, created_at);
create index if not exists ix_conteos_inventario_empresa_turno
  on conteos_inventario (empresa_id, turno_id, created_at);

alter table movimientos_caja enable row level security;
alter table movimientos_caja force row level security;
drop policy if exists movimientos_caja_tenant_all on movimientos_caja;
create policy movimientos_caja_tenant_all on movimientos_caja
  for all using (empresa_id = current_tenant_id())
  with check (empresa_id = current_tenant_id());
drop policy if exists movimientos_caja_admin on movimientos_caja;
create policy movimientos_caja_admin on movimientos_caja
  for all using (is_admin_context()) with check (is_admin_context());

alter table conteos_inventario enable row level security;
alter table conteos_inventario force row level security;
drop policy if exists conteos_inventario_tenant_all on conteos_inventario;
create policy conteos_inventario_tenant_all on conteos_inventario
  for all using (empresa_id = current_tenant_id())
  with check (empresa_id = current_tenant_id());
drop policy if exists conteos_inventario_admin on conteos_inventario;
create policy conteos_inventario_admin on conteos_inventario
  for all using (is_admin_context()) with check (is_admin_context());
