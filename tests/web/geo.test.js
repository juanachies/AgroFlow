import test from 'node:test';
import assert from 'node:assert/strict';

import { areaHa, perimetroM, poligonoDesdeVertices, verticesDe } from '../../src/interfaces/web/lib/geo.js';

// Cuadrado de ~1 km de lado cerca de Pergamino (1 km ≈ 0,009° de latitud).
const lado = 1 / 111.32;
const lat = -33.9;
const dLon = lado / Math.cos((lat * Math.PI) / 180);
const vertices = [[-60.6, lat], [-60.6 + dLon, lat], [-60.6 + dLon, lat - lado], [-60.6, lat - lado]];

test('calcula la superficie de un lote dibujado (≈100 ha) y su perímetro (≈4 km)', () => {
  const lote = poligonoDesdeVertices(vertices);
  assert.ok(Math.abs(areaHa(lote.geometry) - 100) < 1, `área ${areaHa(lote.geometry)}`);
  assert.ok(Math.abs(perimetroM(vertices) - 4000) < 40);
});

test('cierra el anillo, devuelve vértices editables y exige 3 vértices', () => {
  const lote = poligonoDesdeVertices(vertices);
  const anillo = lote.geometry.coordinates[0];
  assert.deepEqual(anillo[0], anillo.at(-1));
  assert.equal(verticesDe(lote).length, 4);
  assert.throws(() => poligonoDesdeVertices(vertices.slice(0, 2)), /3 vértices/);
});

test('descuenta los huecos del polígono', () => {
  const exterior = poligonoDesdeVertices(vertices).geometry.coordinates[0];
  const hueco = poligonoDesdeVertices(vertices.map(([x, y]) => [x + dLon / 4, y - lado / 4]).map(([x, y], i) => [
    i === 1 || i === 2 ? x - dLon / 2 : x, i >= 2 ? y + lado / 2 : y,
  ])).geometry.coordinates[0];
  const conHueco = areaHa({ type: 'Polygon', coordinates: [exterior, hueco] });
  assert.ok(Math.abs(conHueco - 75) < 1, `área con hueco ${conHueco}`);
});
