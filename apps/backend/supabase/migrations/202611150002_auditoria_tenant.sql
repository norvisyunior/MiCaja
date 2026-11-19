-- MiCaja — auditoría desde dispositivos del tenant
-- Las acciones realizadas por un dispositivo activo del negocio (invitaciones
-- creadas, desvinculaciones, reemplazos) se registran en la auditoría.
drop policy if exists auditoria_tenant_insert on auditoria;
create policy auditoria_tenant_insert on auditoria
  for insert with check (empresa_id = current_tenant_id());
