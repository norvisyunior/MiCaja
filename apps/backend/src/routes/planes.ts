import { Router } from 'express';
import { z } from 'zod';
import { withAdmin } from '../db';
import { requireAdmin } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { registrarAuditoria } from '../services/auditoria';
import { refirmarLicenciasEmpresa } from '../services/licencias';

interface PlanRow {
  id: string;
  codigo: string;
  nombre: string;
  max_dispositivos: number | null;
  features: string[];
  precio_mensual: string;
  activo: boolean;
}

const codigoSchema = z.string().trim().min(1).max(50);
const nombreSchema = z.string().trim().min(1).max(120);
const maxDispositivosSchema = z.number().int().min(1).max(1000).nullable();
const featuresSchema = z.array(z.string().trim().min(1).max(50)).max(50);
const precioSchema = z.number().finite().min(0).max(1_000_000);

const crearSchema = z.object({
  codigo: codigoSchema,
  nombre: nombreSchema,
  maxDispositivos: maxDispositivosSchema.optional(),
  features: featuresSchema.default([]),
  precioMensual: precioSchema.default(0),
  activo: z.boolean().default(true),
});

const editarSchema = z
  .object({
    codigo: codigoSchema.optional(),
    nombre: nombreSchema.optional(),
    maxDispositivos: maxDispositivosSchema.optional(),
    features: featuresSchema.optional(),
    precioMensual: precioSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'SIN_CAMBIOS');

export const planesRouter = Router();

planesRouter.use(requireAdmin);

planesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const consulta = z
      .object({
        q: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(25),
      })
      .parse(req.query);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    parametros.push(consulta.limit, (consulta.page - 1) * consulta.limit);
    const resultado = await withAdmin((client) =>
      client.query<PlanRow & { total: number }>(
        `select id, codigo, nombre, max_dispositivos, features,
                precio_mensual, activo, count(*) over()::int as total
         from planes
         where lower(nombre) like $1 or lower(codigo) like $1
         order by precio_mensual asc, nombre asc
         limit $2 offset $3`,
        parametros
      )
    );
    const total = resultado.rows.length ? Number(resultado.rows[0].total) : 0;
    res.json({
      planes: resultado.rows.map(({ total: _total, ...plan }) => plan),
      total,
      page: consulta.page,
      limit: consulta.limit,
    });
  })
);

planesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const datos = crearSchema.parse(req.body);
    const creado = await withAdmin(async (client) => {
      try {
        const plan = await client.query<PlanRow>(
          `insert into planes (codigo, nombre, max_dispositivos, features, precio_mensual, activo)
           values ($1, $2, $3, $4, $5, $6)
           returning id, codigo, nombre, max_dispositivos, features, precio_mensual, activo`,
          [
            datos.codigo,
            datos.nombre,
            datos.maxDispositivos ?? null,
            JSON.stringify(datos.features),
            datos.precioMensual,
            datos.activo,
          ]
        );
        await registrarAuditoria(client, {
          actorTipo: 'admin',
          actorId: req.admin?.id,
          accion: 'plan.creado',
          entidad: 'planes',
          entidadId: plan.rows[0].id,
          payload: { codigo: datos.codigo, nombre: datos.nombre },
          ip: req.ip,
        });
        return plan.rows[0];
      } catch (error) {
        const pg = error as { code?: string };
        if (pg.code === '23505') {
          throw new ApiError(409, 'PLAN_DUPLICADO', 'Ya existe un plan con ese código.');
        }
        throw error;
      }
    });
    res.status(201).json({ plan: creado });
  })
);

planesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const datos = editarSchema.parse(req.body);

    const actualizado = await withAdmin(async (client) => {
      const actual = await client.query<PlanRow>(`select * from planes where id = $1`, [id]);
      if (!actual.rowCount) throw new ApiError(404, 'PLAN_NO_ENCONTRADO');

      try {
        const plan = await client.query<PlanRow>(
          `update planes set
             codigo = coalesce($2, codigo),
             nombre = coalesce($3, nombre),
             max_dispositivos = coalesce($4, max_dispositivos),
             features = coalesce($5, features),
             precio_mensual = coalesce($6, precio_mensual),
             activo = coalesce($7, activo)
           where id = $1
           returning id, codigo, nombre, max_dispositivos, features, precio_mensual, activo`,
          [
            id,
            datos.codigo ?? null,
            datos.nombre ?? null,
            datos.maxDispositivos ?? null,
            datos.features ? JSON.stringify(datos.features) : null,
            datos.precioMensual ?? null,
            datos.activo ?? null,
          ]
        );

        if (datos.features) {
          await client.query(`update licencias set features = $2 where plan_id = $1`, [
            id,
            JSON.stringify(datos.features),
          ]);
          const empresas = await client.query<{ empresa_id: string }>(
            `select distinct empresa_id from licencias where plan_id = $1 and estado = 'activa'`,
            [id]
          );
          for (const empresa of empresas.rows) {
            await refirmarLicenciasEmpresa(client, empresa.empresa_id);
          }
        }

        await registrarAuditoria(client, {
          actorTipo: 'admin',
          actorId: req.admin?.id,
          accion: 'plan.actualizado',
          entidad: 'planes',
          entidadId: id,
          payload: datos,
          ip: req.ip,
        });
        return plan.rows[0];
      } catch (error) {
        const pg = error as { code?: string };
        if (pg.code === '23505') {
          throw new ApiError(409, 'PLAN_DUPLICADO', 'Ya existe un plan con ese código.');
        }
        throw error;
      }
    });
    res.json({ plan: actualizado });
  })
);
