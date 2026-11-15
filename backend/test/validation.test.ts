import { describe, expect, it } from 'vitest';
import {
  activacionSchema,
  registroSchema,
  syncPushSchema,
  ventaInputSchema,
} from '@micaja/shared';

describe('activacionSchema', () => {
  it('normaliza el código a mayúsculas', () => {
    const data = activacionSchema.parse({
      codigo: 'micaja-abcd-2345-wxyz',
      fingerprint: 'fingerprint-123',
      nombre: 'Caja mostrador',
      plataforma: 'android',
      appVersion: '1.0.0',
    });
    expect(data.codigo).toBe('MICAJA-ABCD-2345-WXYZ');
  });

  it('rechaza un código mal formado', () => {
    expect(() =>
      activacionSchema.parse({
        codigo: 'ABC',
        fingerprint: 'fingerprint-123',
        nombre: 'Caja',
        plataforma: 'android',
      })
    ).toThrow();
  });
});

describe('ventaInputSchema', () => {
  const venta = {
    localId: '11111111-1111-4111-8111-111111111111',
    usuarioId: '22222222-2222-4222-8222-222222222222',
    fechaCliente: '2026-11-13T10:00:00.000Z',
    subtotal: 10,
    descuentoPct: 0,
    total: 10,
    formaPago: 'efectivo',
    montoEfectivo: 10,
    montoDigital: 0,
    items: [
      {
        productoId: '33333333-3333-4333-8333-333333333333',
        nombre: 'Café',
        precioUnitario: 10,
        cantidad: 1,
        subtotal: 10,
      },
    ],
  };

  it('acepta una venta válida', () => {
    expect(ventaInputSchema.parse(venta).items).toHaveLength(1);
  });

  it('rechaza una venta sin items', () => {
    expect(() => ventaInputSchema.parse({ ...venta, items: [] })).toThrow();
  });

  it('rechaza descuentos fuera de rango', () => {
    expect(() => ventaInputSchema.parse({ ...venta, descuentoPct: 150 })).toThrow();
  });
});

describe('registroSchema', () => {
  it('aplica el plan básico por defecto', () => {
    const data = registroSchema.parse({
      nombre: 'Bodega La Esquina',
      propietario: 'María',
    });
    expect(data.planCodigo).toBe('basico');
  });

  it('rechaza un plan vacío', () => {
    expect(() =>
      registroSchema.parse({
        nombre: 'Bodega',
        propietario: 'María',
        planCodigo: '',
      })
    ).toThrow();
  });
});

describe('syncPushSchema', () => {
  it('limita el lote a 100 operaciones', () => {
    const operaciones = Array.from({ length: 101 }, () => ({
      operationId: '11111111-1111-4111-8111-111111111111',
      tipo: 'venta',
      timestamp: Date.now(),
      payload: {},
    }));
    expect(() =>
      syncPushSchema.parse({
        deviceId: '22222222-2222-4222-8222-222222222222',
        operations: operaciones,
      })
    ).toThrow();
  });
});
