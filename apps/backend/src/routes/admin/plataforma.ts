import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { uuidSchema, estadoDispositivoSchema } from '@micaja/shared';
import { withAdmin } from '../../db';
import { requireAdmin } from '../../middleware/auth';
import { ApiError } from '../../middleware/errors';
import { asyncHandler } from '../../middleware/async-handler';
import { auditar, consultaLista, desplazamiento, responderLista } from './common';

const dispositivoSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  estado: estadoDispositivoSchema.optional(),
});

const crearAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  nombre: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

const editarAdminSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    nombre: z.string().trim().min(1).max(120).optional(),
    activo: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'SIN_CAMBIOS');

const eliminarAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const adminPlataformaRouter = Router();

adminPlataformaRouter.use(requireAdmin);

adminPlataformaRouter.get(
  '/dispositivos',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where e.deleted_at is null
                    and (lower(d.nombre) like $1 or lower(d.plataforma) like $1)`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and d.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select d.id, d.empresa_id, e.nombre as empresa_nombre, d.nombre, d.plataforma,
                d.app_version, d.rol::text as rol, d.estado, d.last_seen_at, d.last_sync_at,
                d.licencia_emitida_en, d.created_at, count(*) over()::int as total
         from dispositivos d
         join empresas e on e.id = d.empresa_id
         ${filtro}
         order by d.last_seen_at desc nulls last, d.created_at desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminPlataformaRouter.patch(
  '/dispositivos/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = dispositivoSchema.refine((valor) => Object.keys(valor).length > 0, 'SIN_CAMBIOS').parse(req.body);
    const actualizado = await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string; estado: string }>(
        `select empresa_id, estado from dispositivos where id = $1`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
      const siguiente = datos.estado ?? actual.rows[0].estado;
      const dispositivo = await client.query(
        `update dispositivos set
           nombre = coalesce($2, nombre),
           estado = $3::dispositivo_estado,
           licencia_firmada = case when $3 in ('inactivo', 'bloqueado') then null
                                   else licencia_firmada end,
           licencia_emitida_en = case when $3 in ('inactivo', 'bloqueado') then null
                                      else licencia_emitida_en end,
           updated_at = now()
         where id = $1
         returning id, empresa_id, nombre, plataforma, estado, updated_at`,
        [id, datos.nombre ?? null, siguiente]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'dispositivo.actualizado',
        entidad: 'dispositivos',
        entidadId: id,
        payload: datos,
      });
      return dispositivo.rows[0];
    });
    res.json({ dispositivo: actualizado });
  })
);

adminPlataformaRouter.get(
  '/administradores',
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
      client.query<{ total: number }>(
        `select id, email, nombre, rol::text as rol, activo, protegido,
                created_at, updated_at, count(*) over()::int as total
         from admin_usuarios
         where lower(nombre) like $1 or lower(email) like $1
         order by created_at desc, id desc
         limit $2 offset $3`,
        parametros
      )
    );
    const total = resultado.rows.length ? Number(resultado.rows[0].total) : 0;
    res.json({
      administradores: resultado.rows.map(({ total: _total, ...admin }) => admin),
      total,
      page: consulta.page,
      limit: consulta.limit,
    });
  })
);

adminPlataformaRouter.post(
  '/administradores',
  asyncHandler(async (req, res) => {
    const datos = crearAdminSchema.parse(req.body);
    const creado = await withAdmin(async (client) => {
      const hash = await bcrypt.hash(datos.password, 10);
      const admin = await client.query(
        `insert into admin_usuarios (email, nombre, password_hash, rol)
         values ($1, $2, $3, 'superadmin')
         returning id, email, nombre, rol::text as rol, activo, created_at`,
        [datos.email, datos.nombre, hash]
      );
      await auditar(req, client, {
        accion: 'admin.creado',
        entidad: 'admin_usuarios',
        entidadId: admin.rows[0].id,
        payload: { email: datos.email, nombre: datos.nombre, rol: 'superadmin' },
      });
      return admin.rows[0];
    });
    res.status(201).json({ administrador: creado });
  })
);

adminPlataformaRouter.patch(
  '/administradores/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = editarAdminSchema.parse(req.body);
    const actualizado = await withAdmin(async (client) => {
      const actual = await client.query<{
        id: string;
        email: string;
        activo: boolean;
        protegido: boolean;
      }>(
        `select id, email, activo, protegido from admin_usuarios where id = $1`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'ADMIN_NO_ENCONTRADO');

      if (
        actual.rows[0].protegido &&
        (datos.activo === false ||
          (datos.email !== undefined &&
            datos.email.toLowerCase() !== actual.rows[0].email.toLowerCase()))
      ) {
        throw new ApiError(
          409,
          'ADMIN_PROTEGIDO',
          'La cuenta del propietario no puede desactivarse ni cambiar de correo.'
        );
      }

      if (datos.activo === false) {
        if (req.admin?.id === id) {
          throw new ApiError(409, 'ADMIN_PROTEGIDO', 'No puedes desactivar tu propia cuenta.');
        }
        if (actual.rows[0].activo) {
          const activos = await client.query<{ n: number }>(
            `select count(*)::int as n from admin_usuarios where activo`
          );
          if (activos.rows[0].n <= 1) {
            throw new ApiError(409, 'ULTIMO_ADMIN', 'Debe quedar al menos un administrador activo.');
          }
        }
      }

      const hash = datos.password ? await bcrypt.hash(datos.password, 10) : null;
      const admin = await client.query(
        `update admin_usuarios set
           email = coalesce($2, email),
           nombre = coalesce($3, nombre),
           activo = coalesce($4, activo),
           password_hash = coalesce($5, password_hash),
           updated_at = now()
         where id = $1
          returning id, email, nombre, rol::text as rol, activo, protegido, updated_at`,
        [id, datos.email ?? null, datos.nombre ?? null, datos.activo ?? null, hash]
      );
      await auditar(req, client, {
        accion: 'admin.actualizado',
        entidad: 'admin_usuarios',
        entidadId: id,
        payload: {
          email: datos.email,
          nombre: datos.nombre,
          activo: datos.activo,
          password: datos.password ? 'cambiada' : undefined,
        },
      });
      return admin.rows[0];
    });
    res.json({ administrador: actualizado });
  })
);

adminPlataformaRouter.delete(
  '/administradores/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const { email } = eliminarAdminSchema.parse(req.body);

    await withAdmin(async (client) => {
      const actual = await client.query<{
        email: string;
        activo: boolean;
        protegido: boolean;
      }>(
        `select email, activo, protegido from admin_usuarios where id = $1`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'ADMIN_NO_ENCONTRADO');

      if (actual.rows[0].protegido) {
        throw new ApiError(
          409,
          'ADMIN_PROTEGIDO',
          'La cuenta del propietario no puede eliminarse.'
        );
      }
      if (req.admin?.id === id) {
        throw new ApiError(409, 'ADMIN_PROTEGIDO', 'No puedes eliminar tu propia cuenta.');
      }
      if (actual.rows[0].email.toLowerCase() !== email) {
        throw new ApiError(
          409,
          'CONFIRMACION_INVALIDA',
          'El correo no coincide con el administrador que quieres eliminar.'
        );
      }

      const conteos = await client.query<{ total: number; activos: number }>(
        `select count(*)::int as total,
                count(*) filter (where activo)::int as activos
         from admin_usuarios`
      );
      if (
        conteos.rows[0].total <= 1 ||
        (actual.rows[0].activo && conteos.rows[0].activos <= 1)
      ) {
        throw new ApiError(
          409,
          'ULTIMO_ADMIN',
          'Debe quedar al menos un administrador activo.'
        );
      }

      await client.query(`delete from admin_usuarios where id = $1`, [id]);
      await auditar(req, client, {
        accion: 'admin.eliminado',
        entidad: 'admin_usuarios',
        entidadId: id,
        payload: {},
      });
    });

    res.status(204).end();
  })
);

adminPlataformaRouter.get(
  '/invitaciones',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [];
    let filtro = `where e.deleted_at is null`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and i.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select i.id, i.empresa_id, e.nombre as empresa_nombre, i.rol::text as rol,
                i.expira_en, i.usado_en, i.dispositivo_id, i.created_at,
                count(*) over()::int as total
         from invitaciones i
         join empresas e on e.id = i.empresa_id
         ${filtro}
         order by i.created_at desc, i.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminPlataformaRouter.get(
  '/auditoria',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const accion = z.string().trim().max(80).optional().parse(req.query.accion);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where lower(a.accion) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and a.empresa_id = $${parametros.length}`;
    }
    if (accion) {
      parametros.push(`${accion}%`);
      filtro += ` and lower(a.accion) like $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select a.id::text, a.empresa_id, e.nombre as empresa_nombre, a.actor_tipo,
                a.actor_id, a.accion, a.entidad, a.entidad_id, a.payload, a.ip,
                a.created_at, count(*) over()::int as total
         from auditoria a
         left join empresas e on e.id = a.empresa_id
         ${filtro}
         order by a.created_at desc, a.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);
