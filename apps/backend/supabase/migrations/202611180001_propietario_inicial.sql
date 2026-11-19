-- Se activa el contexto de administración porque las tablas tienen RLS forzada
-- y la migración corre con el usuario de la API.
select set_config('app.admin', 'true', false);

-- MiCaja — propietario inicial del negocio (2026-11-18)
--
-- Las cuentas creadas desde la app se sincronizan como `admin` porque el
-- esquema local nunca manejó el rol `propietario`. Sin una cuenta con ese rol
-- el dueño no puede reemplazar dispositivos cuando el plan está completo.
--
-- Se promueve al admin más antiguo de cada negocio que todavía no tenga un
-- propietario activo. Es idempotente: si ya existe uno, no toca nada.
with candidatos as (
  select u.id,
         row_number() over (
           partition by u.empresa_id
           order by u.created_at asc, u.id asc
         ) as posicion
  from usuarios u
  where u.deleted_at is null
    and u.rol = 'admin'
    and not exists (
      select 1
      from usuarios p
      where p.empresa_id = u.empresa_id
        and p.rol = 'propietario'
        and p.deleted_at is null
    )
)
update usuarios u
set rol = 'propietario',
    updated_at = now()
from candidatos c
where u.id = c.id
  and c.posicion = 1;
