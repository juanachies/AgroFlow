import test from 'node:test';
import assert from 'node:assert/strict';

import { crearArmarEntradaDeLote } from '../../src/application/usecases/armarEntradaDeLote.js';

const AHORA = () => new Date('2026-11-15T12:00:00Z');
const precios = { origen: 'pizarra de prueba', precios: async () => ({ spot: 300, futuros: [] }) };
const lote = { id: 'l1', lat: -33.9, lon: -60.6, ha: 120, cultivo: 'soja', fechaSiembra: '2026-11-01', cycleDays: 120 };

test('arma sola la entrada del simulador a partir del lote', async () => {
  const armar = crearArmarEntradaDeLote({ precios, ahora: AHORA });
  const { entrada, automatico } = await armar(lote);

  assert.equal(entrada.hoy, '2026-11-15');
  assert.equal(entrada.fechaInicioCosecha, '2027-03-01', 'siembra + ciclo de 120 días');
  assert.equal(entrada.qqHa, 35);
  assert.equal(entrada.ha, 120);
  assert.deepEqual(entrada.servicios, ['transporte', 'almacenaje']);
  assert.deepEqual(entrada.destinos.map((d) => d.tipo), ['silobolsa', 'acopio', 'puerto']);

  const [silobolsa, acopio, puerto] = entrada.destinos;
  assert.equal(silobolsa.precioUsdPorT, 300);
  assert.equal(acopio.precioUsdPorT, 292, 'el acopio paga menos que la pizarra');
  assert.equal(acopio.costoAdicionalUsdPorT, 6);
  assert.match(acopio.nombre, /Pergamino/);
  assert.equal(puerto.terminal, 'Puerto Gran Rosario');
  assert.equal(automatico.precios.fuente, 'pizarra de prueba');
  assert.equal(automatico.rinde.origen, 'referencia por cultivo (supuesto)');
});

test('usa el rinde del productor si lo informa y elige el puerto más cercano', async () => {
  const armar = crearArmarEntradaDeLote({ precios, ahora: AHORA });
  const { entrada, automatico } = await armar({ ...lote, lat: -38.7, lon: -62.2, qqHa: 42 });
  assert.equal(entrada.qqHa, 42);
  assert.equal(automatico.rinde.origen, 'informado por el productor');
  assert.equal(entrada.destinos.at(-1).terminal, 'Bahía Blanca');
});

test('sin pizarra cargada usa el precio por defecto y lo dice', async () => {
  const armar = crearArmarEntradaDeLote({ precios: { precios: async () => { throw new Error('sin red'); } }, ahora: AHORA });
  const { entrada, automatico } = await armar(lote);
  assert.equal(entrada.destinos[0].precioUsdPorT, 300);
  assert.match(automatico.precios.fuente, /por defecto/);
});

test('rechaza lotes sin cultivo, sin siembra o con un cultivo sin referencias', async () => {
  const armar = crearArmarEntradaDeLote({ precios, ahora: AHORA });
  await assert.rejects(() => armar({ ...lote, cultivo: null }), /cultivo y fecha de siembra/);
  await assert.rejects(() => armar({ ...lote, fechaSiembra: null }), /cultivo y fecha de siembra/);
  await assert.rejects(() => armar({ ...lote, cultivo: 'quinoa' }), /rinde de referencia para quinoa/);
});
