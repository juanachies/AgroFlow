import assert from 'node:assert/strict';
import test from 'node:test';
import { tarifaFleteUsdPorT } from '../../src/domain/flete/costoFlete.js';
import { decidirVenta } from '../../src/domain/venta/decisionVenta.js';
import { tarifas } from '../helpers/tarifas.js';
import { barcos, precio, silobolsaSoja } from '../helpers/silobolsa.js';

const hoy = '2026-11-14';
const destino = { terminal: 'Puerto Gran Rosario', distanciaKm: 300 };
const riesgoBajo = { nivel: 'bajo', diasHastaCritico: null };
const base = { silobolsa: silobolsaSoja, riesgo: riesgoBajo, precio, barcos, destino, hoy, tasaAnual: 0.08 };

test('riesgo bajo: espera al barco de diciembre porque el futuro paga más que el costo de esperar', () => {
  const decision = decidirVenta(base, tarifas);
  assert.equal(decision.decision, 'embarcar');
  assert.equal(decision.elegido.barcoId, 'barco-diciembre');
  const noviembre = decision.evaluados.find((e) => e.barcoId === 'barco-noviembre');
  assert.ok(decision.elegido.netoUsd > noviembre.netoUsd);
});

test('descarta el barco que cierra antes de que lleguen los camiones', () => {
  const descartado = decidirVenta(base, tarifas).evaluados.find((e) => e.barcoId === 'cierra-antes');
  assert.equal(descartado.factible, false);
  assert.match(descartado.motivo, /cierre de carga/);
});

test('fechas: pide camiones con el anticipo de reserva y entrega cuando arriba el barco', () => {
  const noviembre = decidirVenta(base, tarifas).evaluados.find((e) => e.barcoId === 'barco-noviembre');
  assert.equal(noviembre.fechaEntrega, '2026-11-25');
  assert.equal(noviembre.fechaCarga, '2026-11-24');
});

test('fletes: bitrén más barato, cantidad según toneladas netas y costo con la tarifa CATAC', () => {
  const { elegido } = decidirVenta(base, tarifas);
  assert.equal(elegido.camiones.tipo, 'camion-bitren');
  assert.equal(elegido.camiones.cantidad, Math.ceil(elegido.tonsNetas / 40));
  const esperado = elegido.tonsNetas * tarifaFleteUsdPorT(300, tarifas) * 0.92;
  assert.ok(Math.abs(elegido.fleteUsd - esperado) < 1e-6);
});

test('la merma por espera baja las toneladas netas', () => {
  const { elegido } = decidirVenta(base, tarifas);
  assert.ok(elegido.tonsNetas < 200);
  const ritmo = tarifas.silobolsa.merma_pct_por_mes.bajo / 30 / 100;
  assert.ok(Math.abs(elegido.tonsNetas - 200 * (1 - ritmo * elegido.diasEspera)) < 1e-9);
});

test('la fecha límite de seguridad deja afuera los barcos que llegan tarde', () => {
  const riesgo = { nivel: 'medio', diasHastaCritico: 15 };
  const decision = decidirVenta({ ...base, riesgo }, tarifas);
  assert.equal(decision.fechaLimite, '2026-11-29');
  assert.equal(decision.elegido.barcoId, 'barco-noviembre');
  const diciembre = decision.evaluados.find((e) => e.barcoId === 'barco-diciembre');
  assert.match(diciembre.motivo, /riesgo alto/);
});

test('riesgo alto: embarca en el primer barco aunque otro pague más', () => {
  const riesgo = { nivel: 'alto', diasHastaCritico: 60 };
  const decision = decidirVenta({ ...base, riesgo }, tarifas);
  assert.equal(decision.elegido.barcoId, 'barco-noviembre');
});

test('si ningún barco llega antes del límite devuelve sin_barco_factible con la fecha límite', () => {
  const riesgo = { nivel: 'alto', diasHastaCritico: 3 };
  const decision = decidirVenta({ ...base, riesgo }, tarifas);
  assert.equal(decision.decision, 'sin_barco_factible');
  assert.equal(decision.fechaLimite, '2026-11-17');
  assert.equal(decision.elegido, undefined);
});

test('descarta el barco que no tiene capacidad para las toneladas', () => {
  const chico = [{ ...barcos[1], toneladasMax: 100 }];
  const decision = decidirVenta({ ...base, barcos: chico }, tarifas);
  assert.equal(decision.decision, 'sin_barco_factible');
  assert.match(decision.evaluados[0].motivo, /capacidad/);
});

test('sin futuro para el mes de entrega usa el precio spot', () => {
  const soloSpot = { spot: 300, futuros: [] };
  const { elegido } = decidirVenta({ ...base, precio: soloSpot, barcos: [barcos[2]] }, tarifas);
  assert.ok(Math.abs(elegido.ingresoUsd - elegido.tonsNetas * 300) < 1e-6);
});

test('rechaza kg, distancia o tasa inválidos', () => {
  assert.throws(() => decidirVenta({ ...base, silobolsa: { ...silobolsaSoja, kg: 0 } }, tarifas), /kg/);
  assert.throws(() => decidirVenta({ ...base, destino: { ...destino, distanciaKm: 0 } }, tarifas), /distanciaKm/);
  assert.throws(() => decidirVenta({ ...base, tasaAnual: -1 }, tarifas), /tasaAnual/);
});
