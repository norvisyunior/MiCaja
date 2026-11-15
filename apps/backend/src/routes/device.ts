import { Router } from 'express';
import { withTenant } from '../db';
import { requireDevice } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';

export const deviceRouter = Router();

deviceRouter.use(requireDevice);

deviceRouter.get(
  '/licencia',
  asyncHandler(async (req, res) => {
    const dispositivo = req.device!;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      const fila = await client.query(
        `select l.estado, l.vence_en, l.grace_dias, l.features,
                d.licencia_firmada, d.licencia_emitida_en, d.estado as dispositivo_estado
         from licencias l
         join dispositivos d on d.empresa_id = l.empresa_id
         where l.empresa_id = $1 and d.id = $2`,
        [dispositivo.empresaId, dispositivo.deviceId]
      );
      if (!fila.rowCount) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }

      const licencia = fila.rows[0];
      return {
        estado: licencia.estado,
        venceEn: licencia.vence_en.toISOString(),
        graceDias: licencia.grace_dias,
        features: licencia.features,
        token: licencia.licencia_firmada,
        emitidaEn: licencia.licencia_emitida_en?.toISOString() ?? null,
        dispositivoEstado: licencia.dispositivo_estado,
      };
    });

    res.json(resultado);
  })
);

deviceRouter.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const dispositivo = req.device!;
    await withTenant(dispositivo.empresaId, (client) =>
      client.query(
        `update dispositivos set last_seen_at = now() where id = $1`,
        [dispositivo.deviceId]
      )
    );
    res.json({ ok: true, serverTime: new Date().toISOString() });
  })
);
