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

test('los acopios que se pasan al caso de uso compiten con los barcos', async () => {
  const { decidirVenta } = contenedorCon(lecturasSanas);
  const acopios = [{ nombre: 'Cooperativa local', distanciaKm: 40, precioUsdPorT: 305, costoAdicionalUsdPorT: 6 }];
  const resultado = await decidirVenta({ ...entrada, acopios });
  assert.equal(resultado.decision, 'vender_acopio');
  assert.equal(resultado.evaluados.filter((e) => e.tipo === 'acopio').length, 1);
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

test('con el calendario real unificado, solo considera barcos del cultivo de la bolsa', async () => {
  const conCultivo = [
    { id: 'maiz-dic', terminal: 'Puerto Gran Rosario', arribo: '2026-12-20', cierreCarga: '2026-12-28', toneladasMax: 5000, cultivo: 'maiz' },
    { id: 'soja-dic', terminal: 'Puerto Gran Rosario', arribo: '2026-12-21', cierreCarga: '2026-12-28', toneladasMax: 5000, cultivo: 'soja' },
  ];
  const puertos = puertosSimulados({ lecturas: lecturasSanas, calendario: conCultivo });
  const { decidirVenta } = crearContenedor({ tarifas: tarifasSimuladas, ...puertos });
  const resultado = await decidirVenta(entrada);
  assert.deepEqual(resultado.evaluados.map((e) => e.barcoId), ['soja-dic']);
});

test('los acopios del destino llegan a la decisión cuando no hay barco a tiempo', async () => {
  const { decidirVenta } = contenedorCon(lecturasHumedadSube);
  const resultado = await decidirVenta({ ...entrada, destino: { ...entrada.destino, acopios: [{ nombre: 'Coop', distanciaKm: 25 }] } });
  assert.ok(['vender_acopio', 'sin_barco_factible'].includes(resultado.decision));
  const acopios = resultado.evaluados.filter((e) => e.tipo === 'acopio');
  assert.equal(acopios.length, 1);
  assert.equal(acopios[0].acopio, 'Coop');
});
