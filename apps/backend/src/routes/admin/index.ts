import { Router } from 'express';
import { adminCatalogoRouter } from './catalogo';
import { adminOperacionRouter } from './operacion';
import { adminPlataformaRouter } from './plataforma';
import { adminUsuariosRouter } from './usuarios';

export const adminControlRouter = Router();

adminControlRouter.use('/usuarios', adminUsuariosRouter);
adminControlRouter.use('/catalogo', adminCatalogoRouter);
adminControlRouter.use('/operacion', adminOperacionRouter);
adminControlRouter.use('/plataforma', adminPlataformaRouter);
