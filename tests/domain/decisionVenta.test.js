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

const coop = { nombre: 'Cooperativa local', distanciaKm: 40, precioUsdPorT: 305, costoAdicionalUsdPorT: 6 };

test('el neto descuenta extracción, flete, costo del acopio y costo financiero', () => {
  const { elegido } = decidirVenta({ ...base, barcos: [], acopios: [coop] }, tarifas);
  const extraccion = elegido.tonsNetas * tarifas.silobolsa.costo_usd_por_t_extraccion;
  assert.ok(Math.abs(elegido.extraccionUsd - extraccion) < 1e-9);
  assert.ok(Math.abs(elegido.adicionalUsd - elegido.tonsNetas * 6) < 1e-9);
  const costos = elegido.extraccionUsd + elegido.fleteUsd + elegido.adicionalUsd + elegido.financieroUsd;
  assert.ok(Math.abs(elegido.netoUsd - (elegido.ingresoUsd - costos)) < 1e-6);
});

test('el flete al acopio usa la distancia del acopio y el del puerto la del puerto', () => {
  const decision = decidirVenta({ ...base, acopios: [coop] }, tarifas);
  const acopio = decision.evaluados.find((e) => e.tipo === 'acopio');
  const puerto = decision.evaluados.find((e) => e.barcoId === 'barco-noviembre');
  const porT = (e, km) => e.fleteUsd / e.tonsNetas - tarifaFleteUsdPorT(km, tarifas) * 0.92;
  assert.ok(Math.abs(porT(acopio, 40)) < 1e-9);
  assert.ok(Math.abs(porT(puerto, 300)) < 1e-9);
});

test('un silobolsa grande tarda varios días en extraerse y entrega después', () => {
  const grande = { ...silobolsaSoja, kg: 3000000 };
  const decision = decidirVenta({ ...base, silobolsa: grande, barcos: [barcos[2]] }, tarifas);
  assert.equal(decision.elegido.extractora.dias, 2);
  assert.equal(decision.elegido.extractora.desde, '2026-12-18');
  assert.equal(decision.elegido.extractora.hasta, '2026-12-19');
  assert.equal(decision.elegido.fechaEntrega, '2026-12-20');
});

test('el último día de extracción también respeta la fecha límite de seguridad', () => {
  const grande = { ...silobolsaSoja, kg: 3000000 };
  const riesgo = { nivel: 'medio', diasHastaCritico: 9 };
  const decision = decidirVenta({ ...base, silobolsa: grande, riesgo, barcos: [barcos[1]] }, tarifas);
  assert.equal(decision.fechaLimite, '2026-11-23');
  assert.equal(decision.decision, 'sin_barco_factible');
  assert.match(decision.evaluados[0].motivo, /riesgo alto/);
});

test('con riesgo bajo el acopio gana si paga más neto que esperar al barco', () => {
  const decision = decidirVenta({ ...base, acopios: [coop] }, tarifas);
  assert.equal(decision.decision, 'vender_acopio');
  assert.equal(decision.elegido.acopio, 'Cooperativa local');
});

test('con riesgo bajo el barco de diciembre gana si el acopio paga poco', () => {
  const barato = { ...coop, precioUsdPorT: 280 };
  const decision = decidirVenta({ ...base, acopios: [barato] }, tarifas);
  assert.equal(decision.decision, 'embarcar');
  assert.equal(decision.elegido.barcoId, 'barco-diciembre');
});

test('con riesgo alto vende en el acopio aunque pague menos: es lo que se puede cargar primero', () => {
  const barato = { ...coop, precioUsdPorT: 250 };
  const riesgo = { nivel: 'alto', diasHastaCritico: 60 };
  const decision = decidirVenta({ ...base, riesgo, acopios: [barato] }, tarifas);
  assert.equal(decision.decision, 'vender_acopio');
});

test('sin barco a tiempo, el acopio evita el sin_barco_factible', () => {
  const riesgo = { nivel: 'medio', diasHastaCritico: 20 };
  const decision = decidirVenta({ ...base, riesgo, barcos: [barcos[0]], acopios: [coop] }, tarifas);
  assert.equal(decision.decision, 'vender_acopio');
});

test('la merma proyecta el paso de riesgo bajo a medio antes de la fecha de carga', () => {
  const riesgo = { nivel: 'bajo', diasHastaMedio: 2, diasHastaCritico: 30 };
  const { elegido } = decidirVenta({ ...base, riesgo, barcos: [], acopios: [coop] }, tarifas);
  const { bajo, medio } = tarifas.silobolsa.merma_pct_por_mes;
  const merma = (bajo * 2 + medio * (elegido.diasEspera - 2)) / 30 / 100;
  assert.ok(Math.abs(elegido.tonsNetas - 200 * (1 - merma)) < 1e-9);
  assert.ok(elegido.mermaUsd > 0);
});

test('rechaza acopios sin precio o sin distancia', () => {
  assert.throws(() => decidirVenta({ ...base, acopios: [{ ...coop, precioUsdPorT: 0 }] }, tarifas), /precioUsdPorT/);
  assert.throws(() => decidirVenta({ ...base, acopios: [{ ...coop, distanciaKm: 0 }] }, tarifas), /distanciaKm/);
});

test('rechaza kg, distancia o tasa inválidos', () => {
  assert.throws(() => decidirVenta({ ...base, silobolsa: { ...silobolsaSoja, kg: 0 } }, tarifas), /kg/);
  assert.throws(() => decidirVenta({ ...base, destino: { ...destino, distanciaKm: 0 } }, tarifas), /distanciaKm/);
  assert.throws(() => decidirVenta({ ...base, tasaAnual: -1 }, tarifas), /tasaAnual/);
});

test('sin barco a tiempo y con acopios cargados: vende en el acopio de mayor neto que llegue antes del límite', () => {
  const riesgo = { nivel: 'alto', diasHastaCritico: 9 };
  const acopios = [
    { nombre: 'Coop lejos', distanciaKm: 120 },
    { nombre: 'Coop cerca', distanciaKm: 25 },
    { nombre: 'Acopio con precio', distanciaKm: 30, precioUsdPorT: 250, tarifaUsdPorT: 4 },
  ];
  const decision = decidirVenta({ ...base, riesgo, acopios }, tarifas);
  assert.equal(decision.decision, 'vender_acopio');
  assert.equal(decision.elegido.acopio, 'Coop cerca');
  assert.equal(decision.evaluados.filter((e) => e.tipo === 'acopio').length, 3);
  assert.ok(decision.elegido.fechaCarga <= decision.fechaLimite);
  assert.ok(decision.elegido.precioUsdPorT < 320); // precio esperado menos el descuento del acopio
  assert.equal(decision.elegido.camiones.tipo, 'camion-bitren');
});

test('si tampoco llega al acopio antes del límite, sigue sin_barco_factible e informa los acopios evaluados', () => {
  const riesgo = { nivel: 'alto', diasHastaCritico: 3 };
  const decision = decidirVenta({ ...base, riesgo, acopios: [{ nombre: 'Coop', distanciaKm: 25 }] }, tarifas);
  assert.equal(decision.decision, 'sin_barco_factible');
  const acopio = decision.evaluados.find((e) => e.tipo === 'acopio');
  assert.equal(acopio.factible, false);
  assert.match(acopio.motivo, /riesgo alto/);
});

test('con barco a tiempo el acopio sin precio propio compite con el descuento supuesto', () => {
  const decision = decidirVenta({ ...base, acopios: [{ nombre: 'Coop', distanciaKm: 25 }] }, tarifas);
  const tipos = decision.evaluados.filter((e) => e.factible).map((e) => e.tipo);
  assert.ok(tipos.includes('puerto') && tipos.includes('acopio'));
});
