import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config';
import { ApiError } from './errors';

export interface AdminTokenPayload extends JwtPayload {
  kind: 'admin';
  email: string;
  rol: string;
}

export interface DeviceTokenPayload extends JwtPayload {
  kind: 'device';
  empresaId: string;
  licenseId: string;
}

export function signAdminToken(admin: { id: string; email: string; rol: string }): string {
  return jwt.sign(
    { kind: 'admin', email: admin.email, rol: admin.rol },
    env.JWT_SECRET,
    {
      subject: admin.id,
      expiresIn: env.JWT_EXPIRES_ADMIN as SignOptions['expiresIn'],
    }
  );
}

export function signDeviceToken(device: {
  deviceId: string;
  empresaId: string;
  licenseId: string;
}): string {
  return jwt.sign(
    { kind: 'device', empresaId: device.empresaId, licenseId: device.licenseId },
    env.JWT_SECRET,
    {
      subject: device.deviceId,
      expiresIn: env.JWT_EXPIRES_DEVICE as SignOptions['expiresIn'],
    }
  );
}

function bearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'TOKEN_REQUERIDO');
  }
  return header.slice(7);
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  try {
    const payload = jwt.verify(bearerToken(req), env.JWT_SECRET) as AdminTokenPayload;
    if (payload.kind !== 'admin' || !payload.sub) {
      throw new ApiError(401, 'TOKEN_INVALIDO');
    }
    req.admin = {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
    };
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'TOKEN_INVALIDO');
  }
}

export function requireDevice(req: Request, _res: Response, next: NextFunction): void {
  try {
    const payload = jwt.verify(bearerToken(req), env.JWT_SECRET) as DeviceTokenPayload;
    if (payload.kind !== 'device' || !payload.sub) {
      throw new ApiError(401, 'TOKEN_INVALIDO');
    }
    req.device = {
      deviceId: payload.sub,
      empresaId: payload.empresaId,
      licenseId: payload.licenseId,
    };
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'TOKEN_INVALIDO');
  }
}
