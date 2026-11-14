import test from 'node:test';
import assert from 'node:assert/strict';

import { planificarCosecha } from '../../src/application/usecases/planificarCosecha.js';
import { compararDestinosUseCase } from '../../src/application/usecases/compararDestinos.js';
import { evaluarSilobolsa } from '../../src/application/usecases/evaluarSilobolsa.js';

test('planificar cosecha integra la ventana con la lluvia y la transitabilidad', () => {
  const resultado = planificarCosecha({
    lote: { cultivo: 'soja', fechaSiembra: '2025-10-01', cicloDias: 120 },
    pronostico: [
      { fecha: '2025-11-25', lluviaMm: 5 },
      { fecha: '2025-11-26', lluviaMm: 12 },
      { fecha: '2025-11-27', lluviaMm: 16 },
    ],
  });

  assert.equal(resultado.ventana.cultivo, 'soja');
  assert.ok(Array.isArray(resultado.transitabilidad));
  assert.ok(resultado.lluvia7d >= 0);
});

test('compara destinos y devuelve el mejor margen', () => {
  const ranking = compararDestinosUseCase([
    { nombre: 'Puerto', margenNeto: 1100 },
    { nombre: 'Acopio', margenNeto: 1500 },
    { nombre: 'Silobolsa', margenNeto: 900 },
  ]);

  assert.equal(ranking[0].nombre, 'Acopio');
  assert.equal(ranking.mejor.nombre, 'Acopio');
});

test('evalúa riesgo en silobolsa con humedad alta y temperatura elevada', () => {
  const riesgo = evaluarSilobolsa({ humedad: 18, temperatura: 28 });
  assert.equal(riesgo.nivel, 'ALTO');
  assert.ok(riesgo.riesgo > 70);
});
