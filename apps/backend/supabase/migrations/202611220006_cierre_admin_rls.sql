-- MiCaja — lectura administrativa de caja y conteos
select set_config('app.admin', 'true', false);

drop policy if exists movimientos_caja_admin on movimientos_caja;
create policy movimientos_caja_admin on movimientos_caja
  for all using (is_admin_context()) with check (is_admin_context());

drop policy if exists conteos_inventario_admin on conteos_inventario;
create policy conteos_inventario_admin on conteos_inventario
  for all using (is_admin_context()) with check (is_admin_context());
