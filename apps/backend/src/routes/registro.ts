import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registroSchema } from '@micaja/shared';
import { withAdmin } from '../db';
import { env } from '../config';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { registrarAuditoria } from '../services/auditoria';
import {
  generarCodigoActivacion,
  hashCodigoActivacion,
} from '../services/licencias';

interface PlanRow {
  id: string;
  codigo: string;
  features: string[];
}

interface LicenciaRow {
  id: string;
  estado: string;
  vence_en: Date;
  grace_dias: number;
}

const limitadorRegistro = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
});

export const registroRouter = Router();

registroRouter.post(
  '/registro',
  limitadorRegistro,
  asyncHandler(async (req, res) => {
    const data = registroSchema.parse(req.body);

    // El autoservicio público solo entrega el plan básico (3 dispositivos).
    // Los planes superiores los asigna el panel de administración.
    if (data.planCodigo !== 'basico') {
      throw new ApiError(
        403,
        'PLAN_NO_DISPONIBLE',
        'El registro público solo admite el plan basico. Los demás planes se asignan por el panel.'
      );
    }

    const creado = await withAdmin(async (client) => {
      const plan = await client.query<PlanRow>(
        `select id, codigo, features from planes where codigo = 'basico' and activo`
      );
      const planRow = plan.rows[0];
      if (!planRow) {
        throw new ApiError(400, 'PLAN_INVALIDO', 'No existe el plan basico');
      }

      const venceEn = new Date(Date.now() + env.REGISTRO_VIGENCIA_DIAS * 86_400_000);
      const codigoActivacion = generarCodigoActivacion();
      const codigoExpiraEn = new Date(Date.now() + 7 * 86_400_000);

      const empresa = await client.query<{ id: string; nombre: string }>(
        `insert into empresas
           (nombre, propietario, email, telefono, estado, plan_id)
         values ($1, $2, $3, $4, 'pendiente', $5)
         returning id, nombre`,
        [
          data.nombre,
          data.propietario,
          data.email ?? null,
          data.telefono ?? null,
          planRow.id,
        ]
      );
      const empresaId = empresa.rows[0].id;

      const licencia = await client.query<LicenciaRow>(
        `insert into licencias
           (empresa_id, plan_id, estado, vence_en, grace_dias, features,
            codigo_activacion_hash, codigo_expira_en)
         values ($1, $2, 'pendiente', $3, $4, $5, $6, $7)
         returning id, estado, vence_en, grace_dias`,
        [
          empresaId,
          planRow.id,
          venceEn,
          7,
          JSON.stringify(planRow.features),
          hashCodigoActivacion(codigoActivacion),
          codigoExpiraEn,
        ]
      );

      await client.query(
        `insert into licencias_eventos (licencia_id, empresa_id, tipo, payload)
         values ($1, $2, 'creada', $3)`,
        [
          licencia.rows[0].id,
          empresaId,
          JSON.stringify({ plan: planRow.codigo, venceEn: venceEn.toISOString(), origen: 'registro' }),
        ]
      );

      await registrarAuditoria(client, {
        empresaId,
        actorTipo: 'publico',
        accion: 'empresa.registrada',
        entidad: 'empresas',
        entidadId: empresaId,
        payload: { nombre: data.nombre, plan: planRow.codigo },
        ip: req.ip,
      });

      return {
        empresa: empresa.rows[0],
        licencia: licencia.rows[0],
        codigoActivacion,
        codigoExpiraEn: codigoExpiraEn.toISOString(),
      };
    });

    res.status(201).json(creado);
  })
);
