import test from 'node:test';
import assert from 'node:assert/strict';

import {
  circuloGeoJSON,
  clasificarLluvia,
  diasEntre,
  etapaDelCiclo,
  evaluarClima,
  fleterosCercanos,
  resumirFleteros,
  ubicarSilobolsas,
} from '../../src/interfaces/web/lib/logistica.js';

const lote = { id: 'l1', latitude: -33.9, longitude: -60.6 };
const oferta = (id, lat, lon, radioKm, recurso = 'camión', unidades = 2) => ({ id, recurso, unidades, radioKm, base: { lat, lon } });

test('filtra fleteros cuyo radio alcanza al lote y los ordena por cercanía', () => {
  const ofertas = [oferta('lejos', -38, -62, 100), oferta('cerca', -33.95, -60.6, 50), oferta('medio', -34.3, -60.6, 80)];
  const cercanos = fleterosCercanos(lote, ofertas);
  assert.deepEqual(cercanos.map((o) => o.id), ['cerca', 'medio']);
  assert.ok(cercanos[0].distanciaKm < cercanos[1].distanciaKm);
  assert.deepEqual(fleterosCercanos(null, ofertas), []);
});

test('resume proveedores y unidades por recurso', () => {
  const resumen = resumirFleteros([oferta('a', 0, 0, 1, 'camión', 3), oferta('b', 0, 0, 1, 'camión', 5), oferta('c', 0, 0, 1, 'embolsadora', 1)]);
  assert.deepEqual(resumen['camión'], { proveedores: 2, unidades: 8 });
  assert.deepEqual(resumen.embolsadora, { proveedores: 1, unidades: 1 });
});

test('clasifica la lluvia pronosticada', () => {
  assert.equal(clasificarLluvia(0), 'seco');
  assert.equal(clasificarLluvia(4), 'leve');
  assert.equal(clasificarLluvia(25), 'fuerte');
  assert.equal(clasificarLluvia(undefined), 'sin-dato');
});

test('marca días en ventana y encuentra el mejor tramo sin lluvia fuerte', () => {
  const forecast = ['01', '02', '03', '04', '05', '06'].map((d, i) => ({
    date: `2027-04-${d}`,
    precipitationMm: [0, 2, 30, 0, 0, 0.5][i],
  }));
  const { dias, mejorTramo } = evaluarClima(forecast, { inicio: '2027-04-04', fin: '2027-04-06' });
  assert.deepEqual(dias.map((d) => d.enVentana), [false, false, false, true, true, true]);
  assert.deepEqual(mejorTramo, { desde: '2027-04-04', hasta: '2027-04-06', dias: 3 });
  assert.equal(evaluarClima([], null).mejorTramo, null);
});

test('calcula el avance del ciclo y los días hasta la cosecha', () => {
  const ventana = { inicio: '2027-03-20', optimo: '2027-04-04', fin: '2027-04-19' };
  const etapa = etapaDelCiclo({ sowingDate: '2026-11-01' }, ventana, '2027-01-01');
  assert.equal(etapa.diasHastaInicio, 78);
  assert.ok(etapa.progreso > 0 && etapa.progreso < 1);
  assert.equal(etapa.enCosecha, false);
  assert.equal(etapaDelCiclo({ sowingDate: '2026-11-01' }, ventana, '2027-03-25').enCosecha, true);
  assert.equal(etapaDelCiclo({ sowingDate: null }, ventana, '2027-01-01'), null);
  assert.equal(diasEntre('2027-01-01', '2027-01-11'), 10);
});

test('ubica silobolsas en su lote y abre en abanico las que comparten lote', () => {
  const bolsas = [{ id: 'b1', loteId: 'l1' }, { id: 'b2', loteId: 'l1' }, { id: 'b3', loteId: 'otro' }, { id: 'b4' }];
  const ubicadas = ubicarSilobolsas(bolsas, [lote]);
  assert.deepEqual(ubicadas.map((u) => u.bolsa.id), ['b1', 'b2']);
  assert.equal(ubicadas[0].latitude, lote.latitude);
  assert.notEqual(ubicadas[1].latitude, lote.latitude);
});

test('genera un círculo cerrado de radio aproximado', () => {
  const { geometry } = circuloGeoJSON(-33, -60, 100);
  const anillo = geometry.coordinates[0];
  assert.deepEqual(anillo[0], anillo.at(-1));
  assert.ok(Math.abs(anillo[0][0] - -60 - 100 / (111.32 * Math.cos((33 * Math.PI) / 180))) < 1e-9);
});
