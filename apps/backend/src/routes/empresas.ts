import { Router } from 'express';
import { z } from 'zod';
import { empresaInputSchema, estadoEmpresaSchema } from '@micaja/shared';
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

interface EmpresaListRow {
  id: string;
  nombre: string;
  propietario: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  plan_id: string | null;
  created_at: Date;
  updated_at: Date;
  licencia_id: string | null;
  licencia_estado: string | null;
  vence_en: Date | null;
  plan_codigo: string | null;
  dispositivos: number;
}

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

export const empresasRouter = Router();

empresasRouter.use(requireAdmin);

empresasRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const resultado = await withAdmin((client) =>
      client.query<EmpresaListRow>(
        `select e.id, e.nombre, e.propietario, e.email, e.telefono, e.estado,
                e.plan_id, e.created_at, e.updated_at,
                l.id as licencia_id, l.estado as licencia_estado, l.vence_en,
                p.codigo as plan_codigo,
                (select count(*) from dispositivos d
                 where d.empresa_id = e.id and d.estado = 'activo')::int as dispositivos
         from empresas e
         left join licencias l on l.empresa_id = e.id
         left join planes p on p.id = l.plan_id
         where e.deleted_at is null
         order by e.created_at desc
         limit 200`
      )
    );
    res.json({ empresas: resultado.rows });
  })
);

empresasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = empresaInputSchema.parse(req.body);

    const creado = await withAdmin(async (client) => {
      const plan = await client.query<PlanRow>(
        `select id, codigo, features from planes where codigo = $1 and activo`,
        [data.planCodigo]
      );
      const planRow = plan.rows[0];
      if (!planRow) {
        throw new ApiError(400, 'PLAN_INVALIDO', `No existe el plan ${data.planCodigo}`);
      }

      const venceEn = data.venceEn
        ? new Date(data.venceEn)
        : new Date(Date.now() + 3650 * 86_400_000);
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
          data.graceDias,
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
          JSON.stringify({ plan: planRow.codigo, venceEn: venceEn.toISOString() }),
        ]
      );

      await registrarAuditoria(client, {
        empresaId,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'empresa.creada',
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

empresasRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const resultado = await withAdmin(async (client) => {
      const empresa = await client.query(
        `select e.*, p.codigo as plan_codigo, p.features as plan_features,
                l.id as licencia_id, l.estado as licencia_estado, l.vence_en,
                l.grace_dias, l.features as licencia_features
         from empresas e
         left join planes p on p.id = e.plan_id
         left join licencias l on l.empresa_id = e.id
         where e.id = $1`,
        [id]
      );
      if (!empresa.rowCount) {
        throw new ApiError(404, 'EMPRESA_NO_ENCONTRADA');
      }

      const dispositivos = await client.query(
        `select id, nombre, plataforma, app_version, estado,
                last_seen_at, last_sync_at, created_at
         from dispositivos
         where empresa_id = $1
         order by created_at asc`,
        [id]
      );

      const conteos = await client.query<{
        usuarios: number;
        productos: number;
        ventas: number;
      }>(
        `select
           (select count(*) from usuarios
            where empresa_id = $1 and deleted_at is null)::int as usuarios,
           (select count(*) from productos
            where empresa_id = $1 and deleted_at is null)::int as productos,
           (select count(*) from ventas where empresa_id = $1)::int as ventas`,
        [id]
      );

      return {
        empresa: empresa.rows[0],
        dispositivos: dispositivos.rows,
        conteos: conteos.rows[0],
      };
    });

    res.json(resultado);
  })
);

/** Edición de datos generales del negocio (panel admin, fase 7). */
empresasRouter.patch(
  '/:id/datos',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const data = empresaInputSchema
      .pick({ nombre: true, propietario: true, email: true, telefono: true })
      .partial()
      .parse(req.body);

    const resultado = await withAdmin(async (client) => {
      const empresa = await client.query<{ id: string; nombre: string }>(
        `update empresas set
           nombre = coalesce($2, nombre),
           propietario = coalesce($3, propietario),
           email = coalesce($4, email),
           telefono = coalesce($5, telefono),
           updated_at = now()
         where id = $1 and deleted_at is null
         returning id, nombre`,
        [id, data.nombre ?? null, data.propietario ?? null, data.email ?? null, data.telefono ?? null]
      );
      if (!empresa.rowCount) {
        throw new ApiError(404, 'EMPRESA_NO_ENCONTRADA');
      }

      await registrarAuditoria(client, {
        empresaId: id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'empresa.actualizada',
        entidad: 'empresas',
        entidadId: id,
        payload: data,
        ip: req.ip,
      });

      return empresa.rows[0];
    });

    res.json({ empresa: resultado });
  })
);

empresasRouter.patch(
  '/:id/estado',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { estado } = z.object({ estado: estadoEmpresaSchema }).parse(req.body);

    const resultado = await withAdmin(async (client) => {
      // No se permite resucitar una empresa borrada (soft delete).
      const empresa = await client.query(
        `update empresas set estado = $2
         where id = $1 and deleted_at is null
         returning id, estado`,
        [id, estado]
      );
      if (!empresa.rowCount) {
        throw new ApiError(404, 'EMPRESA_NO_ENCONTRADA');
      }

      if (estado === 'suspendida' || estado === 'cancelada') {
        await client.query(
          `update licencias set estado = 'suspendida' where empresa_id = $1`,
          [id]
        );
        await client.query(
          `update dispositivos set licencia_firmada = null, licencia_emitida_en = null
           where empresa_id = $1 and licencia_firmada is not null`,
          [id]
        );
      } else if (estado === 'activa') {
        await client.query(
          `update licencias set estado = 'activa'
           where empresa_id = $1 and estado = 'suspendida'`,
          [id]
        );
        await refirmarLicenciasEmpresa(client, id);
      }

      await registrarAuditoria(client, {
        empresaId: id,
        actorTipo: 'admin',
        actorId: req.admin?.id,
        accion: 'empresa.estado',
        entidad: 'empresas',
        entidadId: id,
        payload: { estado },
        ip: req.ip,
      });

      return empresa.rows[0];
    });

    res.json({ empresa: resultado });
  })
);
