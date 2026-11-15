import { Router } from 'express';
import type { PoolClient } from 'pg';
import {
  syncPullQuerySchema,
  syncPushSchema,
  type SyncOperationResult,
} from '@micaja/shared';
import { withTenant } from '../db';
import { requireDevice } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { aplicarOperacion } from '../services/sync';

interface DispositivoEstadoRow {
  estado: string;
}

async function verificarDispositivo(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<void> {
  const resultado = await client.query<DispositivoEstadoRow>(
    `select estado from dispositivos where empresa_id = $1 and id = $2`,
    [empresaId, deviceId]
  );
  if (!resultado.rowCount) {
    throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
  }
  if (resultado.rows[0].estado !== 'activo') {
    throw new ApiError(403, 'DISPOSITIVO_INACTIVO');
  }
}

export const syncRouter = Router();

syncRouter.use(requireDevice);

syncRouter.post(
  '/push',
  asyncHandler(async (req, res) => {
    const data = syncPushSchema.parse(req.body);
    const dispositivo = req.device!;
    if (data.deviceId !== dispositivo.deviceId) {
      throw new ApiError(403, 'DISPOSITIVO_NO_COINCIDE');
    }

    const results: SyncOperationResult[] = [];

    for (const operacion of data.operations) {
      const resultado = await withTenant(dispositivo.empresaId, async (client) => {
        await verificarDispositivo(client, dispositivo.empresaId, dispositivo.deviceId);

        const insertada = await client.query(
          `insert into sync_operations
             (empresa_id, dispositivo_id, operation_id, tipo, payload, estado)
           values ($1, $2, $3, $4, $5, 'pendiente')
           on conflict (empresa_id, operation_id) do nothing
           returning id`,
          [
            dispositivo.empresaId,
            dispositivo.deviceId,
            operacion.operationId,
            operacion.tipo,
            JSON.stringify(operacion.payload),
          ]
        );

        if (!insertada.rowCount) {
          const previa = await client.query<{
            estado: string;
            resultado: unknown;
            error: string | null;
          }>(
            `select estado, resultado, error from sync_operations
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId]
          );
          const fila = previa.rows[0];
          return {
            operationId: operacion.operationId,
            estado: (fila?.estado ?? 'aplicada') as SyncOperationResult['estado'],
            resultado: fila?.resultado ?? undefined,
            error: fila?.error ?? undefined,
          };
        }

        await client.query('savepoint operacion');
        try {
          const aplicado = await aplicarOperacion(client, {
            empresaId: dispositivo.empresaId,
            deviceId: dispositivo.deviceId,
            tipo: operacion.tipo,
            payload: operacion.payload,
          });

          await client.query(
            `update sync_operations
             set estado = 'aplicada', resultado = $3, processed_at = now()
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId, JSON.stringify(aplicado ?? null)]
          );
          await client.query('release savepoint operacion');

          return {
            operationId: operacion.operationId,
            estado: 'aplicada' as const,
            resultado: aplicado,
          };
        } catch (error) {
          await client.query('rollback to savepoint operacion');
          const code = error instanceof ApiError ? error.code : 'ERROR_APLICACION';
          const message = error instanceof Error ? error.message : 'ERROR_DESCONOCIDO';
          await client.query(
            `update sync_operations
             set estado = 'rechazada', error = $3, processed_at = now()
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId, `${code}: ${message}`]
          );
          await client.query('release savepoint operacion');

          return {
            operationId: operacion.operationId,
            estado: 'rechazada' as const,
            error: `${code}: ${message}`,
          };
        }
      });

      results.push(resultado);
    }

    await withTenant(dispositivo.empresaId, (client) =>
      client.query(
        `update dispositivos
         set last_sync_at = now(), last_seen_at = now()
         where id = $1`,
        [dispositivo.deviceId]
      )
    );

    res.json({ results, serverTime: new Date().toISOString() });
  })
);

syncRouter.get(
  '/pull',
  asyncHandler(async (req, res) => {
    const query = syncPullQuerySchema.parse(req.query);
    const dispositivo = req.device!;
    if (query.deviceId !== dispositivo.deviceId) {
      throw new ApiError(403, 'DISPOSITIVO_NO_COINCIDE');
    }

    const since = query.since ?? new Date(0).toISOString();
    const limite = query.limit;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      await verificarDispositivo(client, dispositivo.empresaId, dispositivo.deviceId);

      const productos = await client.query(
        `select id, categoria_id, nombre, precio, emoji, color, imagen, orden,
                activo, stock_actual, stock_minimo, version, updated_at, deleted_at
         from productos
         where empresa_id = $1 and updated_at > $2::timestamptz
         order by updated_at asc
         limit $3`,
        [dispositivo.empresaId, since, limite]
      );

      const categorias = await client.query(
        `select id, nombre, color, orden, activo, version, updated_at, deleted_at
         from categorias
         where empresa_id = $1 and updated_at > $2::timestamptz
         order by updated_at asc
         limit $3`,
        [dispositivo.empresaId, since, limite]
      );

      const usuarios = await client.query(
        `select id, nombre, usuario, rol, activo, version, updated_at, deleted_at
         from usuarios
         where empresa_id = $1 and updated_at > $2::timestamptz
         order by updated_at asc
         limit $3`,
        [dispositivo.empresaId, since, limite]
      );

      const settings = await client.query(
        `select clave, valor, version, updated_at
         from settings
         where empresa_id = $1 and updated_at > $2::timestamptz
         order by updated_at asc
         limit $3`,
        [dispositivo.empresaId, since, limite]
      );

      const licencia = await client.query(
        `select l.estado, l.vence_en, l.grace_dias, d.licencia_firmada
         from licencias l
         join dispositivos d on d.empresa_id = l.empresa_id
         where l.empresa_id = $1 and d.id = $2`,
        [dispositivo.empresaId, dispositivo.deviceId]
      );

      await client.query(
        `update dispositivos
         set last_sync_at = now(), last_seen_at = now()
         where id = $1`,
        [dispositivo.deviceId]
      );

      const cambios = [
        ...productos.rows.map((fila) => ({
          tipo: 'producto',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            categoriaId: fila.categoria_id,
            nombre: fila.nombre,
            precio: Number(fila.precio),
            emoji: fila.emoji,
            color: fila.color,
            imagen: fila.imagen,
            orden: fila.orden,
            activo: fila.activo,
            stock: Number(fila.stock_actual),
            stockMinimo: Number(fila.stock_minimo),
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...categorias.rows.map((fila) => ({
          tipo: 'categoria',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            nombre: fila.nombre,
            color: fila.color,
            orden: fila.orden,
            activo: fila.activo,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...usuarios.rows.map((fila) => ({
          tipo: 'usuario',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            nombre: fila.nombre,
            usuario: fila.usuario,
            rol: fila.rol,
            activo: fila.activo,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...settings.rows.map((fila) => ({
          tipo: 'setting',
          id: fila.clave,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            clave: fila.clave,
            valor: fila.valor,
            version: fila.version,
          },
        })),
      ];

      const licenciaFila = licencia.rows[0];

      return {
        cambios,
        licencia: licenciaFila
          ? {
              estado: licenciaFila.estado,
              venceEn: licenciaFila.vence_en.toISOString(),
              graceDias: licenciaFila.grace_dias,
              token: licenciaFila.licencia_firmada,
            }
          : null,
        serverTime: new Date().toISOString(),
      };
    });

    res.json(resultado);
  })
);
