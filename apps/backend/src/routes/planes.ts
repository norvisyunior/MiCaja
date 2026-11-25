import { Router } from 'express';
import { withAdmin } from '../db';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/async-handler';

interface PlanRow {
  id: string;
  codigo: string;
  nombre: string;
  max_dispositivos: number | null;
  features: string[];
  precio_mensual: string;
  activo: boolean;
}

export const planesRouter = Router();

planesRouter.use(requireAdmin);

planesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const resultado = await withAdmin((client) =>
      client.query<PlanRow>(
        `select id, codigo, nombre, max_dispositivos, features,
                precio_mensual, activo
         from planes
         order by precio_mensual asc, nombre asc`
      )
    );
    res.json({ planes: resultado.rows });
  })
);
