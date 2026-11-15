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

test('arma el plan de proveedores con costo, localidad y calificación', async () => {
  const { armarPlanDeProveedores } = await import('../../src/interfaces/web/lib/logistica.js');
  const asignacion = {
    coberturaPct: 90,
    lineas: [
      {
        linea: { recurso: 'camión', usar_desde: '2027-04-12', usar_hasta: '2027-04-19', pedir_antes_del: '2027-04-03' },
        faltan: 2,
        asignaciones: [
          { ofertaId: 'of-1', proveedor: 'Transporte Pergamino 1', unidades: 6, distanciaKm: 12, precioRelativo: 0.99, costoUsd: 6000 },
          { ofertaId: 'of-2', proveedor: 'Transporte Rojas 1', unidades: 4, distanciaKm: 40, precioRelativo: 1.1, costoUsd: 4400 },
        ],
      },
      {
        linea: { recurso: 'cosechadora', usar_desde: '2027-04-10', usar_hasta: '2027-04-17', pedir_antes_del: '2027-03-26' },
        faltan: 0,
        asignaciones: [{ ofertaId: 'of-9', proveedor: 'Contratista Junín 2', unidades: 2, distanciaKm: 70, precioRelativo: 1, costoUsd: 8000 }],
      },
    ],
  };
  const ofertas = [{ id: 'of-1', calificacion: 4.5, base: { localidad: 'Pergamino' } }];
  const plan = armarPlanDeProveedores({ asignacion, ofertas, toneladas: 1000 });

  assert.equal(plan.filas.length, 3);
  assert.deepEqual(plan.filas[0], {
    recurso: 'camión', proveedor: 'Transporte Pergamino 1', localidad: 'Pergamino', calificacion: 4.5, unidades: 6, distanciaKm: 12,
    precioRelativo: 0.99, costoUSD: 6000, desde: '2027-04-12', hasta: '2027-04-19', pedirAntesDel: '2027-04-03',
  });
  assert.equal(plan.filas[1].localidad, null, 'sin datos del proveedor no inventa localidad');
  assert.deepEqual(plan.camiones, { transportistas: 2, unidades: 10, costoUSD: 10400, costoUSDt: 10.4, costoUSDqq: 1.04 });
  assert.equal(plan.costoTotalUSD, 18400);
  assert.deepEqual(plan.grupos.map((g) => [g.etapa, g.recurso]), [['Transporte', 'camión'], ['Cosecha', 'cosechadora']]);
  assert.deepEqual(plan.faltantes, [{ recurso: 'camión', faltan: 2, desde: '2027-04-12', hasta: '2027-04-19' }]);
  assert.equal(armarPlanDeProveedores({ asignacion: undefined, ofertas: false }).filas.length, 0);
});
