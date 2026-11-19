-- MiCaja — el id de un turno es único por empresa (2026-11-15)
--
-- La PK global de `turnos_caja` permitía que el id de un turno de otro
-- negocio chocara al abrir caja: el `on conflict (id) do nothing` del
-- servidor respondía "idempotente" y el turno nunca llegaba a existir.
-- Mismo problema que ya se corrigió en `movimientos_inventario`.
--
-- Las claves foráneas de `ventas` ya son compuestas `(empresa_id, turno_id)`,
-- así que el cambio no rompe referencias.

alter table turnos_caja
  drop constraint if exists turnos_caja_pkey;

alter table turnos_caja
  add constraint turnos_caja_pkey primary key (empresa_id, id);
