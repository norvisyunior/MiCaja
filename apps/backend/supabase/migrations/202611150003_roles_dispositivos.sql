-- MiCaja — rol de los dispositivos y aislamiento del libro de inventario
-- (2026-11-15)
--
-- 1. Cada dispositivo conoce el rol con el que se activó (propietario, admin
--    o dependiente). El servidor lo usa para impedir que una terminal de
--    trabajador se auto-escale a administradora o cambie la configuración del
--    negocio.
-- 2. El identificador de los movimientos de inventario pasa a ser único por
--    empresa. Antes la PK era global y una operación idempotente podía
--    confundirse con la de otro negocio.
-- 3. La invitación queda ligada al dispositivo que la consumió.

alter table dispositivos
  add column if not exists rol usuario_rol not null default 'propietario';

-- Backfill: si el dispositivo entró con una invitación, hereda su rol.
update dispositivos d
set rol = i.rol
from invitaciones i
where i.dispositivo_id = d.id
  and i.empresa_id = d.empresa_id;

-- La PK global impedía que dos negocios pudieran reutilizar un id (y hacía
-- que `on conflict (id)` de un tenant se cruzara con el de otro).
alter table movimientos_inventario
  drop constraint if exists movimientos_inventario_pkey;

alter table movimientos_inventario
  add constraint movimientos_inventario_pkey primary key (empresa_id, id);

do $$ begin
  alter table invitaciones
    add constraint fk_invitaciones_dispositivo
    foreign key (empresa_id, dispositivo_id)
    references dispositivos (empresa_id, id);
exception when duplicate_object then null; end $$;

create index if not exists ix_dispositivos_empresa_rol
  on dispositivos (empresa_id, rol);
