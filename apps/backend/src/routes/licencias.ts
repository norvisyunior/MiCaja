import { Router } from 'express';
import { z } from 'zod';
import { estadoLicenciaSchema } from '@micaja/shared';
import { withAdmin } from '../db';
import { requireAdmin } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { registrarAuditoria } from '../services/auditoria';
import {
  generarCodigoActivacion,
  hashCodigoActivacion,
  refirmarLicenciasEmpresa,
} from '../services/licencias';

const actualizarLicenciaSchema = z.object({
  planCodigo: z.string().trim().min(1).max(50).optional(),
  venceEn: z.string().datetime().optional(),
  graceDias: z.number().int().min(0).max(365).optional(),
  estado: estadoLicenciaSchema.optional(),
});

interface LicenciaListRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  plan_codigo: string;
  estado: string;
  activada_en: Date | null;
  vence_en: Date;
  grace_dias: number;
  codigo_usado_en: Date | null;
  dispositivos: number;
}

interface LicenciaActualRow {
  id: string;
  empresa_id: string;
  plan_id: string;
  estado: string;
  vence_en: Date;
  grace_dias: number;
}

interface PlanRow {
  id: string;
  codigo: string;
  features: string[];
}

export const licenciasRouter = Router();

licenciasRouter.use(requireAdmin);

licenciasRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const resultado = await withAdmin((client) =>
      client.query<LicenciaListRow>(
        `select l.id, l.empresa_id, e.nombre as empresa_nombre,
                p.codigo as plan_codigo, l.estado, l.activada_en, l.vence_en,
                l.grace_dias, l.codigo_usado_en,
                (select count(*) from dispositivos d
                 where d.empresa_id = l.empresa_id and d.estado = 'activo')::int as dispositivos
         from licencias l
         join empresas e on e.id = l.empresa_id
         join planes p on p.id = l.plan_id
         where e.deleted_at is null
         order by l.vence_en asc
         limit 200`
      )
    );
    res.json({ licencias: resultado.rows });
  })
);

licenciasRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const data = actualizarLicenciaSchema.parse(req.body);

    const resultado = await withAdmin(async (client) => {
      const actual = await client.query<LicenciaActualRow>(
        `select id, empresa_id, plan_id, estado, vence_en, grace_dias
         from licencias where id = $1`,
        [id]
      );
      const licencia = actual.rows[0];
      if (!licencia) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }

      let planId = licencia.plan_id;
      let features: string[] | null = null;
      if (data.planCodigo) {
        const plan = await client.query<PlanRow>(
          `select id, codigo, features from planes where codigo = $1 and activo`,
          [data.planCodigo]
        );
        if (!plan.rowCount) {
          throw new ApiError(400, 'PLAN_INVALIDO');
        }
        planId = plan.rows[0].id;
        features = plan.rows[0].features;
      }

      const actualizada = await client.query(
        `update licencias set
           plan_id = $2,
           vence_en = coalesce($3, vence_en),
           grace_dias = coalesce($4, grace_dias),
           estado = coalesce($5, estado),
           features = coalesce($6, features)
         where id = $1
         returning id, empresa_id, plan_id, estado, vence_en, grace_dias, features`,
        [
          id,
          planId,
          data.venceEn ? new Date(data.venceEn) : null,
          data.graceDias ?? null,
          data.estado ?? null,
          features ? JSON.stringify(features) : null,
        ]
      );

      let tipoEvento: string | null = null;
      if (data.estado === 'suspendida') tipoEvento = 'suspendida';
      else if (data.estado === 'activa' && licencia.estado === 'suspendida') {
        tipoEvento = 'reactivada';
      } else if (data.venceEn || data.planCodigo || data.graceDias !== undefined) {
        tipoEvento = 'renovada';
      }

      if (tipoEvento) {
        await client.query(
          `insert into licencias_eventos (licencia_id, empresa_id, tipo, payload)
           values ($1, $2, $3, $4)`,
          [
            id,
            licencia.empresa_id,
            tipoEvento,
            JSON.stringify({
              venceEn: actualizada.rows[0].vence_en,
              estado: actualizada.rows[0].estado,
            }),
          ]
        );
      }

      // Ciclo de vida de los tokens guardados:
      // - Suspensión: se borra el token de todos los dispositivos; el pull
      //   dejará de entregar licencia y el teléfono la invalidará.
      // - Reactivación o cambios de plan/vigencia/gracia: se re-firma el
      //   token con los datos actuales para que el pull entregue licencias
      //   frescas (exp, features y gracia actualizados).
      if (data.estado === 'suspendida') {
        await client.query(
          `update dispositivos set licencia_firmada = null, licencia_emitida_en = null
           where empresa_id = $1 and licencia_firmada is not null`,
          [licencia.empresa_id]
        );
      } else if (
        data.estado === 'activa' ||
        data.planCodigo ||
        data.venceEn ||
        data.graceDias !== undefined
      ) {
        await refirmarLicenciasEmpresa(client, licencia.empresa_id);
      }

      await registrarAuditoria(client, {
        empresaId: licencia.empresa_id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'licencia.actualizada',
        entidad: 'licencias',
        entidadId: id,
        payload: data,
        ip: req.ip,
      });

      return actualizada.rows[0];
    });

    res.json({ licencia: resultado });
  })
);

licenciasRouter.post(
  '/:id/codigo',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const codigo = generarCodigoActivacion();
    const expira = new Date(Date.now() + 7 * 86_400_000);

    const resultado = await withAdmin(async (client) => {
      const licencia = await client.query<LicenciaActualRow>(
        `select id, empresa_id, plan_id, estado, vence_en, grace_dias
         from licencias where id = $1`,
        [id]
      );
      if (!licencia.rowCount) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }

      await client.query(
        `update licencias set
           codigo_activacion_hash = $2,
           codigo_expira_en = $3,
           codigo_usado_en = null
         where id = $1`,
        [id, hashCodigoActivacion(codigo), expira]
      );

      await registrarAuditoria(client, {
        empresaId: licencia.rows[0].empresa_id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'licencia.codigo_generado',
        entidad: 'licencias',
        entidadId: id,
        payload: { expira: expira.toISOString() },
        ip: req.ip,
      });

      return { codigo, expira: expira.toISOString() };
    });

    res.status(201).json(resultado);
  })
);

licenciasRouter.get(
  '/:id/eventos',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const resultado = await withAdmin((client) =>
      client.query(
        `select id, tipo, payload, created_at
         from licencias_eventos
         where licencia_id = $1
         order by created_at desc
         limit 100`,
        [id]
      )
    );
    res.json({ eventos: resultado.rows });
  })
);
