-- Límites de dispositivos por plan.
-- El plan Básico pasa de 1 a 3 terminales y el Pro de 3 a 5. Empresa sigue
-- sin límite (null). Es idempotente: se puede aplicar sobre bases existentes.
--
-- `planes` tiene RLS forzada; sin el contexto de administración el update
-- afectaría 0 filas sin dar error.
select set_config('app.admin', 'true', false);

update planes set max_dispositivos = 3 where codigo = 'basico';
update planes set max_dispositivos = 5 where codigo = 'pro';
