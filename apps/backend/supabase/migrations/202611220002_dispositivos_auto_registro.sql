-- MiCaja — registro automático de la instalación en sync/heartbeat (2026-11-22)
-- La licencia es del negocio: la instalación se registra sola con el token de
-- dispositivo, sin operaciones administrativas ni comprobaciones de estado.

drop policy if exists dispositivos_tenant_insert on dispositivos;
create policy dispositivos_tenant_insert on dispositivos
  for insert with check (empresa_id = current_tenant_id());
