import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crearLote,
  diasEnVentana,
  leerSnapshotClimatico,
  parsearGeoJSON,
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

test('crea el lote con el ciclo por cultivo y calcula la ventana existente', () => {
  const lot = crearLote({
    name: 'Lote norte',
    crop: 'soja',
    areaHa: '20',
    latitude: '-32',
    longitude: '-61',
    sowingDate: '2025-10-01',
    cycleDays: '120',
  });
  assert.equal(lot.areaHa, 20);
  assert.equal(ventanaDelLote(lot).optimo, '2026-01-29');
  assert.throws(() => crearLote({ ...lot, areaHa: 0 }), /superficie/);
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
