import { Router } from 'express';
import { z } from 'zod';
import { USUARIO_ROLES, uuidSchema } from '@micaja/shared';
import { withAdmin } from '../../db';
import { requireAdmin } from '../../middleware/auth';
import { ApiError } from '../../middleware/errors';
import { asyncHandler } from '../../middleware/async-handler';
import { crearHashPin } from '../../services/pin';
import {
  auditar,
  consultaLista,
  desplazamiento,
  exigirEmpresa,
  responderLista,
} from './common';

const PIN_INICIAL = '1234';

const nombreSchema = z.string().trim().min(1).max(120);
const usuarioSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .transform((valor) => valor.toLowerCase())
  .refine((valor) => /^[a-z0-9._-]{3,40}$/.test(valor), 'USUARIO_INVALIDO');

const crearSchema = z.object({
  empresaId: uuidSchema,
  nombre: nombreSchema,
  usuario: usuarioSchema,
  rol: z.enum(USUARIO_ROLES).default('dependiente'),
  activo: z.boolean().default(true),
});

const editarSchema = z
  .object({
    nombre: nombreSchema.optional(),
    usuario: usuarioSchema.optional(),
    rol: z.enum(USUARIO_ROLES).optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'SIN_CAMBIOS');

interface UsuarioRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  usuario: string;
  rol: string;
  activo: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  total: number;
}

function conflictoUnico(error: unknown): boolean {
  const pg = error as { code?: string; constraint?: string };
  return pg.code === '23505' && Boolean(pg.constraint?.startsWith('ux_usuarios_'));
}

async function protegerCambio(
  client: Parameters<typeof exigirEmpresa>[0],
  id: string,
  cambio: { rol?: string; activo?: boolean; borrar?: boolean }
): Promise<{ id: string; empresa_id: string; rol: string; activo: boolean }> {
  const actual = await client.query<{
    id: string;
    empresa_id: string;
    rol: string;
    activo: boolean;
  }>(
    `select id, empresa_id, rol::text as rol, activo
     from usuarios where id = $1 and deleted_at is null`,
    [id]
  );
  const usuario = actual.rows[0];
  if (!usuario) throw new ApiError(404, 'USUARIO_NO_ENCONTRADO');

  const rolFinal = cambio.rol ?? usuario.rol;
  const activoFinal = cambio.activo ?? usuario.activo;
  const retiraAcceso = Boolean(cambio.borrar) || (!activoFinal && usuario.activo);

  if (usuario.rol === 'propietario' && (rolFinal !== 'propietario' || retiraAcceso)) {
    throw new ApiError(409, 'USUARIO_PROTEGIDO', 'La cuenta del propietario no puede desactivarse ni cambiar de rol.');
  }
  if (
    (cambio.borrar || (usuario.rol === 'admin' && (rolFinal !== 'admin' || retiraAcceso))) &&
    rolFinal !== 'propietario'
  ) {
    const restantes = await client.query<{ n: number }>(
      `select count(*)::int as n from usuarios
       where empresa_id = $1 and deleted_at is null and activo
         and rol in ('propietario', 'admin') and id <> $2`,
      [usuario.empresa_id, id]
    );
    if (restantes.rows[0].n === 0) {
      throw new ApiError(409, 'ULTIMO_ADMIN', 'El negocio debe conservar al menos un administrador activo.');
    }
  }
  return usuario;
}

export const adminUsuariosRouter = Router();

adminUsuariosRouter.use(requireAdmin);

adminUsuariosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where u.deleted_at is null and e.deleted_at is null
                    and (lower(u.nombre) like $1 or lower(u.usuario) like $1 or lower(e.nombre) like $1)`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and u.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));

    const resultado = await withAdmin((client) =>
      client.query<UsuarioRow>(
        `select u.id, u.empresa_id, e.nombre as empresa_nombre, u.nombre, u.usuario,
                u.rol::text as rol, u.activo, u.version, u.created_at, u.updated_at,
                u.deleted_at, count(*) over()::int as total
         from usuarios u
         join empresas e on e.id = u.empresa_id
         ${filtro}
         order by u.created_at desc, u.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminUsuariosRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const datos = crearSchema.parse(req.body);

    const creado = await withAdmin(async (client) => {
      await exigirEmpresa(client, datos.empresaId);
      try {
        const usuario = await client.query<Omit<UsuarioRow, 'total' | 'empresa_nombre'>>(
          `insert into usuarios (empresa_id, nombre, usuario, rol, activo, password_hash)
           values ($1, $2, $3, $4, $5, $6)
           returning id, empresa_id, nombre, usuario, rol::text as rol, activo, version,
                   created_at, updated_at, deleted_at`,
          [
            datos.empresaId,
            datos.nombre,
            datos.usuario,
            datos.rol,
            datos.activo,
            crearHashPin(PIN_INICIAL),
          ]
        );
        await auditar(req, client, {
          empresaId: datos.empresaId,
          accion: 'usuario.creado',
          entidad: 'usuarios',
          entidadId: usuario.rows[0].id,
          payload: { nombre: datos.nombre, usuario: datos.usuario, rol: datos.rol },
        });
        return usuario.rows[0];
      } catch (error) {
        if (conflictoUnico(error)) {
          throw new ApiError(409, 'USUARIO_DUPLICADO', 'Ese nombre de usuario ya está en uso.');
        }
        throw error;
      }
    });

    res.status(201).json({ usuario: creado, pinInicial: PIN_INICIAL });
  })
);

adminUsuariosRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = editarSchema.parse(req.body);

    const actualizado = await withAdmin(async (client) => {
      await protegerCambio(client, id, datos);
      try {
        const usuario = await client.query<Omit<UsuarioRow, 'total' | 'empresa_nombre'>>(
          `update usuarios set
             nombre = coalesce($2, nombre),
             usuario = coalesce($3, usuario),
             rol = coalesce($4::usuario_rol, rol),
             activo = coalesce($5, activo),
             version = version + 1
           where id = $1 and deleted_at is null
           returning id, empresa_id, nombre, usuario, rol::text as rol, activo, version,
                   created_at, updated_at, deleted_at`,
          [id, datos.nombre ?? null, datos.usuario ?? null, datos.rol ?? null, datos.activo ?? null]
        );
        await auditar(req, client, {
          empresaId: usuario.rows[0].empresa_id,
          accion: 'usuario.actualizado',
          entidad: 'usuarios',
          entidadId: id,
          payload: datos,
        });
        return usuario.rows[0];
      } catch (error) {
        if (conflictoUnico(error)) {
          throw new ApiError(409, 'USUARIO_DUPLICADO', 'Ese nombre de usuario ya está en uso.');
        }
        throw error;
      }
    });

    res.json({ usuario: actualizado });
  })
);

adminUsuariosRouter.post(
  '/:id/reset-pin',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const actualizado = await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string }>(
        `select empresa_id from usuarios where id = $1 and deleted_at is null`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'USUARIO_NO_ENCONTRADO');
      await client.query(
        `update usuarios set password_hash = $2, version = version + 1
         where id = $1`,
        [id, crearHashPin(PIN_INICIAL)]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'usuario.pin_restablecido',
        entidad: 'usuarios',
        entidadId: id,
      });
      return { id, pinInicial: PIN_INICIAL };
    });
    res.json(actualizado);
  })
);

adminUsuariosRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    await withAdmin(async (client) => {
      const usuario = await protegerCambio(client, id, { borrar: true });
      await client.query(
        `update usuarios set activo = false, deleted_at = now(), version = version + 1
         where id = $1`,
        [id]
      );
      await auditar(req, client, {
        empresaId: usuario.empresa_id,
        accion: 'usuario.eliminado',
        entidad: 'usuarios',
        entidadId: id,
      });
    });
    res.status(204).end();
  })
);
