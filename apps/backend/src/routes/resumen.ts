import { Router } from 'express';
import { withAdmin } from '../db';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/async-handler';

interface ConteosRow {
  empresas_total: number;
  empresas_activas: number;
  empresas_pendientes: number;
  empresas_suspendidas: number;
  empresas_canceladas: number;
  licencias_total: number;
  licencias_activas: number;
  licencias_vencidas: number;
  licencias_suspendidas: number;
  licencias_pendientes: number;
  licencias_en_gracia: number;
  licencias_por_vencer: number;
  dispositivos_activos: number;
  dispositivos_24h: number;
}

interface AtencionRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  estado: string;
  plan_codigo: string;
  vence_en: Date;
  grace_dias: number;
  fin_gracia: Date;
}

interface EventoRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  tipo: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

const licenciasEfectivas = `
  with licencias_efectivas as (
    select l.id, l.empresa_id, l.plan_id, l.estado, l.vence_en, l.grace_dias,
           case
             when l.estado in ('suspendida', 'vencida') then l.estado
             when now() > l.vence_en + make_interval(days => l.grace_dias) then 'vencida'
             else l.estado
           end as estado_efectivo
    from licencias l
    join empresas e on e.id = l.empresa_id and e.deleted_at is null
  )
`;

export const resumenRouter = Router();

resumenRouter.use(requireAdmin);

resumenRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const resultado = await withAdmin(async (client) => {
      const conteos = await client.query<ConteosRow>(
        `${licenciasEfectivas}
         select
           (select count(*) from empresas where deleted_at is null)::int as empresas_total,
           (select count(*) from empresas where deleted_at is null and estado = 'activa')::int as empresas_activas,
           (select count(*) from empresas where deleted_at is null and estado = 'pendiente')::int as empresas_pendientes,
           (select count(*) from empresas where deleted_at is null and estado = 'suspendida')::int as empresas_suspendidas,
           (select count(*) from empresas where deleted_at is null and estado = 'cancelada')::int as empresas_canceladas,
           (select count(*) from licencias_efectivas)::int as licencias_total,
           (select count(*) from licencias_efectivas where estado_efectivo = 'activa')::int as licencias_activas,
           (select count(*) from licencias_efectivas where estado_efectivo = 'vencida')::int as licencias_vencidas,
           (select count(*) from licencias_efectivas where estado_efectivo = 'suspendida')::int as licencias_suspendidas,
           (select count(*) from licencias_efectivas where estado_efectivo = 'pendiente')::int as licencias_pendientes,
           (select count(*) from licencias_efectivas
            where estado_efectivo = 'activa' and vence_en <= now())::int as licencias_en_gracia,
           (select count(*) from licencias_efectivas
            where estado_efectivo = 'activa'
              and vence_en > now()
              and vence_en <= now() + interval '30 days')::int as licencias_por_vencer,
           (select count(*) from dispositivos d
            join empresas e on e.id = d.empresa_id and e.deleted_at is null
            where d.estado = 'activo')::int as dispositivos_activos,
           (select count(*) from dispositivos d
            join empresas e on e.id = d.empresa_id and e.deleted_at is null
            where d.estado = 'activo'
              and d.last_sync_at > now() - interval '24 hours')::int as dispositivos_24h`
      );

      const atencion = await client.query<AtencionRow>(
        `${licenciasEfectivas}
         select le.id, le.empresa_id, e.nombre as empresa_nombre,
                le.estado_efectivo as estado, p.codigo as plan_codigo,
                le.vence_en, le.grace_dias,
                le.vence_en + make_interval(days => le.grace_dias) as fin_gracia
         from licencias_efectivas le
         join empresas e on e.id = le.empresa_id
         join planes p on p.id = le.plan_id
         where le.estado_efectivo in ('vencida', 'pendiente')
            or (le.estado_efectivo = 'activa'
                and le.vence_en <= now() + interval '30 days')
         order by
           case le.estado_efectivo
             when 'vencida' then 0
             when 'pendiente' then 1
             else 2
           end,
           le.vence_en asc
         limit 8`
      );

      const eventos = await client.query<EventoRow>(
        `select ev.id::text, ev.empresa_id, e.nombre as empresa_nombre,
                ev.tipo, ev.payload, ev.created_at
         from licencias_eventos ev
         join empresas e on e.id = ev.empresa_id
         where e.deleted_at is null
         order by ev.created_at desc, ev.id desc
         limit 8`
      );

      return {
        conteos: conteos.rows[0],
        atencion: atencion.rows,
        eventos: eventos.rows,
      };
    });

    res.json(resultado);
  })
);
