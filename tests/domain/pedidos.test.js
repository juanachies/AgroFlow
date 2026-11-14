import assert from 'node:assert/strict';
import test from 'node:test';
import { dimensionarCosecha } from '../../src/domain/maquinaria/dimensionarCosecha.js';
import { armarPedidos, costosPorServicio } from '../../src/domain/maquinaria/pedidos.js';
import { sumarDias } from '../../src/domain/shared/fechas.js';
import { tarifas } from '../helpers/tarifas.js';

const campo = { ha: 2000, qqHa: 35, cultivo: 'soja', diasDisponibles: 20, urgencia: 'media' };
const pedidosPara = (destino, distanciaKm) =>
  armarPedidos(dimensionarCosecha({ ...campo, destino, distanciaKm }, tarifas), '2027-04-10', tarifas);
const buscar = (pedidos, recurso) => pedidos.find((p) => p.recurso === recurso);

test('sumarDias suma y resta días y rechaza fechas inválidas', () => {
  assert.equal(sumarDias('2027-04-10', 5), '2027-04-15');
  assert.equal(sumarDias('2027-04-10', -15), '2027-03-26');
  assert.throws(() => sumarDias('mañana', 1), /fecha inválida/);
});

test('las fechas de pedido respetan el anticipo de cada recurso', () => {
  const pedidos = pedidosPara('puerto', 300);
  const anticipo = tarifas.reserva.anticipo_dias;
  assert.equal(buscar(pedidos, 'cosechadora').pedir_antes_del, sumarDias('2027-04-10', -anticipo.cosechadora));
  assert.equal(buscar(pedidos, 'camión').pedir_antes_del, sumarDias('2027-04-10', -anticipo.camion));
  assert.ok(buscar(pedidos, 'cosechadora').pedir_antes_del < buscar(pedidos, 'camión').pedir_antes_del);
});

test('el período de uso dura los días de cosecha dimensionados', () => {
  const r = dimensionarCosecha({ ...campo, destino: 'puerto', distanciaKm: 300 }, tarifas);
  const cosechadora = buscar(armarPedidos(r, '2027-04-10', tarifas), 'cosechadora');
  const dias = (new Date(cosechadora.usar_hasta) - new Date(cosechadora.usar_desde)) / 86400000 + 1;
  assert.equal(dias, r.cosechadoras.dias);
});

test('cada pedido lleva su servicio', () => {
  assert.deepEqual([...new Set(pedidosPara('puerto', 300).map((p) => p.servicio))].sort(), ['cosecha', 'transporte']);
  assert.deepEqual([...new Set(pedidosPara('silobolsa').map((p) => p.servicio))].sort(), ['almacenaje', 'cosecha']);
  assert.deepEqual([...new Set(pedidosPara(undefined).map((p) => p.servicio))], ['cosecha']);
});

test('los costos por servicio suman todos los pedidos', () => {
  const pedidos = pedidosPara('puerto', 300);
  const suma = Object.values(costosPorServicio(pedidos)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(suma - pedidos.reduce((a, p) => a + p.costo_usd, 0)) < 1e-6);
});
