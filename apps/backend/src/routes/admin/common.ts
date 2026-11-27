import type { PoolClient } from 'pg';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@micaja/shared';
import { ApiError } from '../../middleware/errors';
import { registrarAuditoria } from '../../services/auditoria';

export const listaQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type ListaQuery = z.infer<typeof listaQuerySchema>;

export function consultaLista(req: Request): ListaQuery {
  return listaQuerySchema.parse(req.query);
}

export function desplazamiento(consulta: ListaQuery): number {
  return (consulta.page - 1) * consulta.limit;
}

export function responderLista<T extends { total: number | string }>(
  res: Response,
  filas: T[],
  consulta: ListaQuery
): void {
  const items = filas.map(({ total: _total, ...fila }) => fila);
  res.json({
    items,
    total: filas.length ? Number(filas[0].total) : 0,
    page: consulta.page,
    limit: consulta.limit,
  });
}

export async function exigirEmpresa(client: PoolClient, empresaId: string): Promise<void> {
  const empresa = await client.query(
    `select 1 from empresas where id = $1 and deleted_at is null`,
    [empresaId]
  );
  if (!empresa.rowCount) {
    throw new ApiError(404, 'EMPRESA_NO_ENCONTRADA');
  }
}

type EntradaAuditoria = Omit<
  Parameters<typeof registrarAuditoria>[1],
  'actorTipo' | 'actorId' | 'ip'
>;

export async function auditar(
  req: Request,
  client: PoolClient,
  entrada: EntradaAuditoria
): Promise<void> {
  await registrarAuditoria(client, {
    ...entrada,
    actorTipo: 'admin',
    actorId: req.admin?.id,
    ip: req.ip,
  });
}
