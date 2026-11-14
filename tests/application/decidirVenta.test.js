import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { tarifasSimuladas } from '../helpers/tarifas.js';
import { lecturasHumedadSube, lecturasSanas, puertosSimulados } from '../helpers/silobolsa.js';

const entrada = {
  silobolsaId: 'SB-001',
  hoy: '2026-11-14',
  destino: { terminal: 'Puerto Gran Rosario', distanciaKm: 300 },
  tasaAnual: 0.08,
};

const contenedorCon = (lecturas) => {
  const puertos = puertosSimulados({ lecturas });
  return { puertos, ...crearContenedor({ tarifas: tarifasSimuladas, ...puertos }) };
};

test('silobolsa sano: embarca en el barco de mayor neto y pide el calendario de la terminal', async () => {
  const { decidirVenta, puertos } = contenedorCon(lecturasSanas);
  const resultado = await decidirVenta(entrada);
  assert.equal(resultado.silobolsaId, 'SB-001');
  assert.equal(resultado.decision, 'embarcar');
  assert.equal(resultado.elegido.barcoId, 'barco-diciembre');
  assert.deepEqual(puertos.llamadasBarcos, [
    { terminal: 'Puerto Gran Rosario', desde: '2026-11-14', hasta: '2027-03-14' },
  ]);
});

test('humedad en suba: no hay barco a tiempo y avisa la fecha límite', async () => {
  const { decidirVenta } = contenedorCon(lecturasHumedadSube);
  const resultado = await decidirVenta(entrada);
  assert.equal(resultado.decision, 'sin_barco_factible');
  assert.equal(resultado.fechaLimite, '2026-11-19');
});

test('evaluarSilobolsa devuelve el silobolsa con su riesgo', async () => {
  const { evaluarSilobolsa } = contenedorCon(lecturasHumedadSube);
  const { silobolsa, riesgo } = await evaluarSilobolsa('SB-001');
  assert.equal(silobolsa.cultivo, 'soja');
  assert.equal(riesgo.nivel, 'medio');
});

test('sin los puertos de otros módulos el contenedor no arma la venta', () => {
  const { decidirVenta, evaluarSilobolsa } = crearContenedor({ tarifas: tarifasSimuladas });
  assert.equal(decidirVenta, undefined);
  assert.equal(evaluarSilobolsa, undefined);
});
