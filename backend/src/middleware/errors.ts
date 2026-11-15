import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'NO_ENCONTRADO', path: req.path });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'DATOS_INVALIDOS',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Cuerpo JSON malformado (body-parser): respuesta clara en vez de 500.
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: 'JSON_INVALIDO',
      message: 'El cuerpo de la solicitud no es JSON válido.',
    });
    return;
  }

  console.error('[micaja-api]', error);
  res.status(500).json({ error: 'ERROR_INTERNO' });
}
