-- MiCaja — protección de la cuenta del propietario del panel (2026-11-27)

select set_config('app.admin', 'true', false);

alter table admin_usuarios
  add column if not exists protegido boolean not null default false;

update admin_usuarios
   set protegido = true
 where lower(email) = 'norviscabrera7@gmail.com';

create index if not exists ix_admin_usuarios_protegido
  on admin_usuarios (protegido)
  where protegido;
