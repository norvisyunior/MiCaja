-- El login por usuario + PIN busca la cuenta sin conocer la empresa, así que
-- el nombre de usuario debe ser único a nivel global (sin distinguir mayúsculas
-- ni cuentas borradas). Antes de crear el índice se renombran los duplicados
-- históricos que pudieran existir entre empresas.
with duplicados as (
  select id,
         row_number() over (partition by lower(usuario) order by created_at, id) as posicion
  from usuarios
  where deleted_at is null
)
update usuarios u
set usuario = left(u.usuario, 22)
              || '-' || substr(u.empresa_id::text, 1, 8)
              || '-' || substr(u.id::text, 1, 8),
    updated_at = now()
from duplicados d
where u.id = d.id
  and d.posicion > 1;

create unique index if not exists ux_usuarios_usuario_global
  on usuarios (lower(usuario))
  where deleted_at is null;

comment on index ux_usuarios_usuario_global is
  'Usuario global para login por usuario + PIN entre empresas';
