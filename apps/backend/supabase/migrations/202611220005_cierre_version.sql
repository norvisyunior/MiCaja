-- MiCaja — versión de sincronización para movimientos de caja y conteos
select set_config('app.admin', 'true', false);

alter table movimientos_caja
  add column if not exists version integer not null default 1;

alter table conteos_inventario
  add column if not exists version integer not null default 1;
