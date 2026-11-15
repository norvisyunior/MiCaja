import type { PoolClient } from 'pg';

export async function registrarAuditoria(
  client: PoolClient,
  input: {
    empresaId?: string | null;
    actorTipo: string;
    actorId?: string | null;
    accion: string;
    entidad?: string | null;
    entidadId?: string | null;
    payload?: unknown;
    ip?: string | null;
  }
): Promise<void> {
  await client.query(
    `insert into auditoria
       (empresa_id, actor_tipo, actor_id, accion, entidad, entidad_id, payload, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.empresaId ?? null,
      input.actorTipo,
      input.actorId ?? null,
      input.accion,
      input.entidad ?? null,
      input.entidadId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.ip ?? null,
    ]
  );
}
