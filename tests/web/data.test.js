import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crearLote,
  diasEnVentana,
  editarLote,
  leerSnapshotClimatico,
  parsearGeoJSON,
  quitarSiembra,
  sembrarLote,
  variedadesDe,
  ventanaDelLote,
} from '../../src/interfaces/web/lib/data.js';

const polygon = {
  type: 'Feature',
  properties: { name: 'Lote norte' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-61, -32],
      [-60.9, -32],
      [-60.9, -32.1],
      [-61, -32.1],
      [-61, -32],
    ]],
  },
};

test('importa polígonos GeoJSON y rechaza anillos no cerrados', () => {
  assert.equal(parsearGeoJSON(JSON.stringify(polygon))[0].properties.name, 'Lote norte');
  const invalid = structuredClone(polygon);
  invalid.geometry.coordinates[0].pop();
  assert.throws(() => parsearGeoJSON(JSON.stringify(invalid)), /polígono inválido/);
});

test('valida la estructura mínima del snapshot climático', () => {
  const snapshot = {
    lote: { latitude: -32, longitude: -61 },
    queriedAt: '2026-01-01T00:00:00.000Z',
    dailyForecast: [],
    sourceStatus: { requested: ['Open-Meteo'], successful: ['Open-Meteo'] },
  };
  assert.deepEqual(leerSnapshotClimatico(JSON.stringify(snapshot)), snapshot);
  assert.throws(() => leerSnapshotClimatico(JSON.stringify({ ...snapshot, dailyForecast: undefined })), /serie diaria/);
});

test('crea el lote como terreno, sin cultivo ni ventana', () => {
  const lot = crearLote({ name: 'Lote norte', areaHa: '20', latitude: '-32', longitude: '-61' });
  assert.equal(lot.areaHa, 20);
  assert.equal(lot.crop, null);
  assert.equal(ventanaDelLote(lot), null);
  assert.throws(() => crearLote({ ...lot, areaHa: 0 }), /superficie/);
  assert.throws(() => crearLote({ ...lot, latitude: '95' }), /latitud/);
});

test('siembra un cultivo con su ciclo y calcula la ventana', () => {
  const terreno = crearLote({ name: 'Lote norte', areaHa: '20', latitude: '-32', longitude: '-61' });
  const sembrado = sembrarLote(terreno, { crop: 'soja', variety: 'soja-corto', sowingDate: '2025-10-01', cycleDays: '120' });
  assert.equal(sembrado.variety, 'soja-corto');
  assert.equal(ventanaDelLote(sembrado).optimo, '2026-01-29');
  assert.throws(() => sembrarLote(terreno, { crop: 'soja', variety: 'maiz-corto', sowingDate: '2025-10-01' }), /ciclo/);
  assert.throws(() => sembrarLote(terreno, { crop: 'soja', variety: 'soja-corto', sowingDate: '' }), /fecha/);
  assert.equal(quitarSiembra(sembrado).sowingDate, null);
});

test('el catálogo ofrece ciclos para soja, maíz, trigo y sorgo', () => {
  for (const cultivo of ['soja', 'maiz', 'trigo', 'sorgo']) {
    assert.ok(variedadesDe(cultivo).length >= 3, cultivo);
  }
});

test('edita nombre, superficie y ubicación sin tocar la siembra', () => {
  const terreno = crearLote({ name: 'A', areaHa: '10', latitude: '-32', longitude: '-61' });
  const sembrado = sembrarLote(terreno, { crop: 'trigo', variety: 'trigo-intermedio', sowingDate: '2026-06-01' });
  const editado = editarLote(sembrado, { name: 'B', areaHa: '12', latitude: '-33', longitude: '-60' });
  assert.equal(editado.name, 'B');
  assert.equal(editado.crop, 'trigo');
  assert.equal(editado.cycleDays, 170);
});

test('filtra pronóstico a los días que cubre la ventana', () => {
  const days = [
    { date: '2026-01-13' },
    { date: '2026-01-14' },
    { date: '2026-02-13' },
    { date: '2026-02-14' },
  ];
  assert.deepEqual(
    diasEnVentana(days, { inicio: '2026-01-14', fin: '2026-02-13' }).map(({ date }) => date),
    ['2026-01-14', '2026-02-13'],
  );
});
