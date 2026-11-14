// Dominio Marketplace de cadetes: ofertas, asignación del plan de pedido y reservas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarOferta, distanciaKm, unidadesLibres, asignarLinea, asignarPlan, crearReservas } from '../../src/domain/marketplace/index.js';

const lote = { lat: -33.95, lon: -60.6 };
const oferta = (id, extra = {}) => ({
  id, proveedor: `Prov ${id}`, recurso: 'camión', tipo: 'camion-semi', unidades: 10,
  base: { lat: -33.89, lon: -60.57 }, radioKm: 100, disponibleDesde: '2027-04-01', disponibleHasta: '2027-04-30',
  precioRelativo: 1, calificacion: 4, ...extra,
});
const linea = (extra = {}) => ({ servicio: 'transporte', recurso: 'camión', tipo: 'camion-semi', cantidad: 12, usar_desde: '2027-04-10', usar_hasta: '2027-04-15', pedir_antes_del: '2027-04-03', costo_usd: 12000, viajes_por_dia: 2, ...extra });

test('ofertas: validación y distancia', () => {
  assert.equal(validarOferta(oferta('a')).unidades, 10);
  assert.throws(() => validarOferta(oferta('b', { recurso: 'helicóptero' })), /recurso inválido/);
  assert.throws(() => validarOferta(oferta('c', { disponibleHasta: '2027-03-01' })), /anterior/);
  assert.ok(Math.abs(distanciaKm({ lat: -32.95, lon: -60.64 }, { lat: -33.89, lon: -60.57 }) - 104.8) < 1);
});

test('unidades libres descuentan reservas superpuestas (mínimo diario)', () => {
  const o = validarOferta(oferta('a'));
  const reservas = [{ ofertaId: 'a', unidades: 4, desde: '2027-04-12', hasta: '2027-04-13' }, { ofertaId: 'a', unidades: 7, desde: '2027-04-20', hasta: '2027-04-22' }];
  assert.equal(unidadesLibres(o, reservas, '2027-04-10', '2027-04-15'), 6);
  assert.equal(unidadesLibres(o, reservas, '2027-04-16', '2027-04-18'), 10);
});

test('asignación: prefiere mismo tipo y menor precio, reparte entre proveedores y respeta radio y fechas', () => {
  const ofertas = [
    oferta('caro', { precioRelativo: 1.2 }),
    oferta('barato', { precioRelativo: 0.9, unidades: 8 }),
    oferta('otro-tipo', { tipo: 'camion-bitren', precioRelativo: 0.5 }),
    oferta('lejos', { base: { lat: -38, lon: -62 }, precioRelativo: 0.1 }),
    oferta('sin-fecha', { disponibleHasta: '2027-04-12', precioRelativo: 0.2 }),
  ].map(validarOferta);
  const r = asignarLinea(linea(), { ofertas, lote });
  assert.deepEqual(r.asignaciones.map((a) => [a.ofertaId, a.unidades]), [['barato', 8], ['caro', 4]]);
  assert.equal(r.cubierta, true);
  assert.equal(r.asignaciones[0].costoUsd, Math.round(12000 * (8 / 12) * 0.9));
});

test('plan: faltantes con sugerencia y sin doble reserva del mismo proveedor', () => {
  const ofertas = [oferta('unico', { unidades: 10 })];
  const plan = asignarPlan({
    pedidos: [linea({ cantidad: 6 }), linea({ cantidad: 6 }), { recurso: 'silobolsa', cantidad: 3, usar_desde: '2027-04-10', usar_hasta: '2027-04-15' }],
    ofertas, lote,
  });
  assert.equal(plan.lineas.length, 2); // la bolsa es insumo, no cadete
  assert.equal(plan.lineas[1].faltan, 2);
  assert.equal(plan.completa, false);
  assert.equal(plan.coberturaPct, 83.3);
  assert.match(plan.faltantes[0].sugerencia, /no alcanzan/);
  const sinOfertas = asignarPlan({ pedidos: [linea({ recurso: 'cosechadora' })], ofertas, lote });
  assert.match(sinOfertas.faltantes[0].sugerencia, /no hay proveedores/);
});

test('reservas: los camiones a puerto llevan puerto, viajes y capacidad', () => {
  const plan = asignarPlan({ pedidos: [linea()], ofertas: [oferta('a', { unidades: 20 })], lote });
  const reservas = crearReservas({ asignacion: plan, loteId: 'L1', destino: { tipo: 'puerto', puerto: 'gran-rosario', nombre: 'Puerto' }, capacidadCamionT: { 'camion-semi': 30 } });
  assert.equal(reservas.length, 1);
  assert.deepEqual(
    { id: reservas[0].id, puerto: reservas[0].puerto, viajes: reservas[0].viajesPorDia, cap: reservas[0].capacidadT, unidades: reservas[0].unidades },
    { id: 'L1-01', puerto: 'gran-rosario', viajes: 2, cap: 30, unidades: 12 },
  );
  const aAcopio = crearReservas({ asignacion: plan, loteId: 'L2', destino: { tipo: 'acopio', nombre: 'Coop' } });
  assert.equal(aAcopio[0].puerto, null);
});
