import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPAS_PROXIMAMENTE,
  horaActualizacion,
  propiedadesClima,
  valorClimaActual,
} from '../../src/interfaces/web/lib/climaCapas.js';

const RESUMEN = {
  actual: {
    precipitacion: 2.5,
    humedadAire: 60,
    humedadSuelo: 0.3,
    temperatura: 20,
    viento: 18,
  },
};

test('valorClimaActual toma el valor actual de la variable pedida', () => {
  assert.equal(valorClimaActual(RESUMEN, 'temperatura'), 20);
  assert.equal(valorClimaActual(RESUMEN, 'humedadSuelo'), 0.3);
  assert.equal(valorClimaActual(RESUMEN, 'desconocida'), null);
  assert.equal(valorClimaActual(null, 'temperatura'), null);
});

test('propiedadesClima arma color y etiqueta para la capa activa', () => {
  const porLote = new Map([['lote-1', RESUMEN]]);

  assert.deepEqual(propiedadesClima('lote-1', 'temperatura', porLote), {
    climaColor: '#22c55e',
    climaLabel: '20 °C',
  });
  assert.deepEqual(propiedadesClima('lote-1', 'humedadSuelo', porLote), {
    climaColor: '#eab308',
    climaLabel: '30 %',
  });
  assert.deepEqual(propiedadesClima('lote-sin-datos', 'viento', porLote), {
    climaColor: '#22c55e',
    climaLabel: '—',
  });
  assert.deepEqual(propiedadesClima('lote-1', null, porLote), {});
});

test('las capas sin datos quedan marcadas como próximamente', () => {
  assert.deepEqual(CAPAS_PROXIMAMENTE.map(({ id }) => id), ['elevacion', 'transitabilidad', 'ndvi']);
});

test('horaActualizacion formatea la hora y tolera fechas inválidas', () => {
  assert.equal(horaActualizacion('sin-fecha'), null);
  assert.match(horaActualizacion('2026-11-15T12:34:00.000Z'), /^\d{2}:\d{2}$/);
});
