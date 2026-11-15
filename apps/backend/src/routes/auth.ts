import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { adminLoginSchema } from '@micaja/shared';
import { withAdmin } from '../db';
import { signAdminToken } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { registrarAuditoria } from '../services/auditoria';

interface AdminRow {
  id: string;
  email: string;
  nombre: string;
  password_hash: string;
  rol: string;
  activo: boolean;
}

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = adminLoginSchema.parse(req.body);

    const resultado = await withAdmin((client) =>
      client.query<AdminRow>(
        `select id, email, nombre, password_hash, rol, activo
         from admin_usuarios
         where lower(email) = lower($1)`,
        [data.email]
      )
    );

    const admin = resultado.rows[0];
    if (!admin || !admin.activo) {
      throw new ApiError(401, 'CREDENCIALES_INVALIDAS');
    }

    const valida = await bcrypt.compare(data.password, admin.password_hash);
    if (!valida) {
      throw new ApiError(401, 'CREDENCIALES_INVALIDAS');
    }

    const token = signAdminToken({ id: admin.id, email: admin.email, rol: admin.rol });

    await withAdmin((client) =>
      registrarAuditoria(client, {
        actorTipo: 'admin',
        actorId: admin.id,
        accion: 'admin.login',
        entidad: 'admin_usuarios',
        entidadId: admin.id,
        ip: req.ip,
      })
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        nombre: admin.nombre,
        rol: admin.rol,
      },
    });
  })
);
