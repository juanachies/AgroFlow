import test from 'node:test';
import assert from 'node:assert/strict';

import { calcularVentanaCosecha } from '../../src/domain/cosecha/ventanaCosecha.js';
import { perdidasPorDemora } from '../../src/domain/cosecha/perdidasPorDemora.js';

test('calcula la ventana de cosecha a partir del ciclo del cultivo', () => {
  const ventana = calcularVentanaCosecha({
    fechaSiembra: '2025-10-01',
    cultivo: 'soja',
    duracionDias: 120,
  });

  assert.equal(ventana.inicio, '2026-01-14');
  assert.equal(ventana.optimo, '2026-01-29');
  assert.equal(ventana.fin, '2026-02-13');
});

test('las pérdidas por demora crecen con los días de retraso', () => {
  const resultado = perdidasPorDemora({ diasDemora: 33, humedad: 16, cultivo: 'soja' });
  assert.ok(resultado.kgPorHa > 200);
  assert.ok(resultado.porcentaje > 0.05);
});
