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
  empresa_estado: string;
  plan_codigo: string;
  plan_nombre: string;
  estado: string;
  activada_en: Date | null;
  vence_en: Date;
  grace_dias: number;
  codigo_expira_en: Date | null;
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

interface LicenciaConEmpresaRow extends LicenciaActualRow {
  empresa_estado: string;
}

interface LicenciaDirectaRow {
  id: string;
  empresa_id: string;
  plan_id: string;
  estado: string;
  vence_en: Date;
  grace_dias: number;
  features: string[] | null;
  empresa_estado: string;
  plan_codigo: string;
  plan_features: string[];
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
                e.estado as empresa_estado, p.codigo as plan_codigo,
                p.nombre as plan_nombre, l.estado, l.activada_en, l.vence_en,
                l.grace_dias, l.codigo_expira_en, l.codigo_usado_en,
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

licenciasRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const resultado = await withAdmin((client) =>
      client.query(
        `select l.id, l.empresa_id, e.nombre as empresa_nombre,
                e.estado as empresa_estado, e.propietario, e.email, e.telefono,
                p.codigo as plan_codigo, p.nombre as plan_nombre,
                p.features as plan_features, p.max_dispositivos,
                l.estado, l.activada_en, l.vence_en, l.grace_dias, l.features,
                l.codigo_expira_en, l.codigo_usado_en, l.created_at, l.updated_at,
                (select count(*) from dispositivos d
                 where d.empresa_id = l.empresa_id and d.estado = 'activo')::int
                  as dispositivos
         from licencias l
         join empresas e on e.id = l.empresa_id
         join planes p on p.id = l.plan_id
         where l.id = $1 and e.deleted_at is null`,
        [id]
      )
    );

    if (!resultado.rowCount) {
      throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
    }

    res.json({ licencia: resultado.rows[0] });
  })
);

licenciasRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const data = actualizarLicenciaSchema.parse(req.body);

    const resultado = await withAdmin(async (client) => {
      const actual = await client.query<LicenciaConEmpresaRow>(
        `select l.id, l.empresa_id, l.plan_id, l.estado, l.vence_en,
                l.grace_dias, e.estado as empresa_estado
         from licencias l
         join empresas e on e.id = l.empresa_id
         where l.id = $1 and e.deleted_at is null`,
        [id]
      );
      const licencia = actual.rows[0];
      if (!licencia) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }
      if (
        data.estado === 'activa' &&
        (licencia.empresa_estado === 'suspendida' || licencia.empresa_estado === 'cancelada')
      ) {
        throw new ApiError(
          409,
          'EMPRESA_INACTIVA',
          'Reactiva el negocio antes de activar su licencia.'
        );
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
           activada_en = case
             when $5 = 'activa' and activada_en is null then now()
             else activada_en
           end,
           features = coalesce($6, features)
         where id = $1
         returning id, empresa_id, plan_id, estado, activada_en, vence_en,
                   grace_dias, features`,
        [
          id,
          planId,
          data.venceEn ? new Date(data.venceEn) : null,
          data.graceDias ?? null,
          data.estado ?? null,
          features ? JSON.stringify(features) : null,
        ]
      );

      if (data.planCodigo) {
        await client.query(
          `update empresas set plan_id = $2, updated_at = now() where id = $1`,
          [licencia.empresa_id, planId]
        );
      }
      if (data.estado === 'activa' && licencia.empresa_estado === 'pendiente') {
        await client.query(
          `update empresas set estado = 'activa', updated_at = now() where id = $1`,
          [licencia.empresa_id]
        );
      }

      let tipoEvento: string | null = null;
      if (data.estado === 'suspendida') tipoEvento = 'suspendida';
      else if (data.estado === 'activa' && licencia.estado === 'pendiente') {
        tipoEvento = 'activada';
      } else if (
        data.estado === 'activa' &&
        (licencia.estado === 'suspendida' || licencia.estado === 'vencida')
      ) {
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

/**
 * Renovación autogestionada: fija la nueva vigencia y entrega un código que el
 * cliente introduce en Ajustes › Sincronización. La licencia sigue marcada
 * como `vencida` (y sin token) hasta que se canjea el código, así que el
 * dispositivo continúa en modo consulta mientras tanto.
 */
const renovarSchema = z.object({
  venceEn: z.string().datetime(),
  graceDias: z.number().int().min(0).max(365).optional(),
});

licenciasRouter.post(
  '/:id/renovar',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const data = renovarSchema.parse(req.body);
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
           vence_en = $2,
           grace_dias = coalesce($3, grace_dias),
           codigo_activacion_hash = $4,
           codigo_expira_en = $5,
           codigo_usado_en = null
         where id = $1`,
        [id, new Date(data.venceEn), data.graceDias ?? null, hashCodigoActivacion(codigo), expira]
      );

      await registrarAuditoria(client, {
        empresaId: licencia.rows[0].empresa_id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'licencia.renovacion_generada',
        entidad: 'licencias',
        entidadId: id,
        payload: { venceEn: data.venceEn, expira: expira.toISOString() },
        ip: req.ip,
      });

      return { codigo, expira: expira.toISOString(), venceEn: data.venceEn };
    });

    res.status(201).json(resultado);
  })
);

/**
 * Activación directa desde el panel: no hace falta código ni esperar a que el
 * cliente lo canjee. Fija la vigencia, activa la empresa si estaba pendiente y
 * re-firma el token de todos los dispositivos; el próximo pull lo recibe.
 */
const activarDirectoSchema = z.object({
  planCodigo: z.string().trim().min(1).max(50).optional(),
  venceEn: z.string().datetime().optional(),
  graceDias: z.number().int().min(0).max(365).optional(),
});

licenciasRouter.post(
  '/:id/activar',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const data = activarDirectoSchema.parse(req.body);

    const resultado = await withAdmin(async (client) => {
      const actual = await client.query<LicenciaDirectaRow>(
        `select l.id, l.empresa_id, l.plan_id, l.estado, l.vence_en, l.grace_dias,
                l.features, e.estado as empresa_estado, p.codigo as plan_codigo,
                p.features as plan_features
         from licencias l
         join empresas e on e.id = l.empresa_id
         join planes p on p.id = l.plan_id
         where l.id = $1 and e.deleted_at is null`,
        [id]
      );
      const licencia = actual.rows[0];
      if (!licencia) {
        throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
      }
      if (licencia.empresa_estado === 'suspendida' || licencia.empresa_estado === 'cancelada') {
        throw new ApiError(
          409,
          'EMPRESA_INACTIVA',
          'Reactiva el negocio antes de activar su licencia.'
        );
      }

      let planId = licencia.plan_id;
      let planCodigo = licencia.plan_codigo;
      let features =
        Array.isArray(licencia.features) && licencia.features.length > 0
          ? licencia.features
          : licencia.plan_features;
      if (data.planCodigo) {
        const plan = await client.query<PlanRow>(
          `select id, codigo, features from planes where codigo = $1 and activo`,
          [data.planCodigo]
        );
        if (!plan.rowCount) {
          throw new ApiError(400, 'PLAN_INVALIDO');
        }
        planId = plan.rows[0].id;
        planCodigo = plan.rows[0].codigo;
        features = plan.rows[0].features;
      }

      const venceEn = data.venceEn ? new Date(data.venceEn) : licencia.vence_en;
      if (venceEn.getTime() <= Date.now()) {
        throw new ApiError(
          400,
          'VENCIMIENTO_INVALIDO',
          'Indica una fecha de vencimiento futura para activar la licencia.'
        );
      }
      const graceDias = data.graceDias ?? licencia.grace_dias;

      const actualizada = await client.query(
        `update licencias set
           plan_id = $2,
           estado = 'activa',
           activada_en = coalesce(activada_en, now()),
           vence_en = $3,
           grace_dias = $4,
           features = $5,
           updated_at = now()
         where id = $1
         returning id, empresa_id, plan_id, estado, activada_en, vence_en,
                   grace_dias, features`,
        [id, planId, venceEn, graceDias, JSON.stringify(features)]
      );

      await client.query(
        `update empresas set
           plan_id = $2,
           estado = case when estado = 'pendiente' then 'activa'::empresa_estado else estado end,
           updated_at = now()
         where id = $1`,
        [licencia.empresa_id, planId]
      );

      await client.query(
        `insert into licencias_eventos (licencia_id, empresa_id, tipo, payload)
         values ($1, $2, $3, $4)`,
        [
          id,
          licencia.empresa_id,
          licencia.estado === 'suspendida' ? 'reactivada' : 'activada',
          JSON.stringify({
            via: 'panel',
            plan: planCodigo,
            venceEn: venceEn.toISOString(),
            graceDias,
          }),
        ]
      );

      await refirmarLicenciasEmpresa(client, licencia.empresa_id);

      await registrarAuditoria(client, {
        empresaId: licencia.empresa_id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'licencia.activacion_directa',
        entidad: 'licencias',
        entidadId: id,
        payload: { plan: planCodigo, venceEn: venceEn.toISOString(), graceDias },
        ip: req.ip,
      });

      return actualizada.rows[0];
    });

    res.json({ licencia: resultado });
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
