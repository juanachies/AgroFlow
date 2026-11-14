// Dominio Maquinaria: aviso a los cadetes según la decisión de venta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoCadetes } from '../../src/domain/maquinaria/cadetes.js';

const HOY = '2027-04-22';
const ventaPuerto = { decision: 'vender', canal: 'puerto', mejorVenta: { despacho: '2027-04-30' }, silobolsa: { detalle: { venderEl: '2027-07-28' } } };
const ventaAcopio = { decision: 'vender', canal: 'acopio', mejorVenta: { despacho: '2027-04-30' }, silobolsa: { detalle: { venderEl: '2027-07-28' } } };
const ventaSilo = { decision: 'silobolsa', canal: null, mejorVenta: { despacho: HOY }, silobolsa: { detalle: { venderEl: '2027-07-20' } } };

test('cadetes al puerto: camiones, fechas y días en campo', () => {
  const c = avisoCadetes({ venta: ventaPuerto, toneladas: 1800, fechaGranoListo: '2027-04-28', diasCosecha: 6, distanciaPuertoKm: 300, hoy: HOY });
  assert.equal(c.destino, 'puerto');
  assert.equal(c.inicio, '2027-04-30');
  assert.equal(c.pedirEl, '2027-04-27');
  assert.equal(c.diasEnCampo, 2);
  assert.ok(c.camiones > 0 && c.embolsadoras === 0);
  assert.equal(c.aviso.nivel, 'info');
});

test('cadetes: acopio cerca necesita menos camiones que puerto lejos', () => {
  const p = avisoCadetes({ venta: ventaPuerto, toneladas: 1800, fechaGranoListo: '2027-04-30', diasCosecha: 6, distanciaPuertoKm: 300, hoy: HOY });
  const a = avisoCadetes({ venta: ventaAcopio, toneladas: 1800, fechaGranoListo: '2027-04-30', diasCosecha: 6, distanciaPuertoKm: 300, distanciaAcopioKm: 20, hoy: HOY });
  assert.ok(a.camiones < p.camiones);
});

test('cadetes a silobolsa: embolsadora, sin camiones, urgente si hay que pedir hoy', () => {
  const c = avisoCadetes({ venta: ventaSilo, toneladas: 1800, fechaGranoListo: HOY, diasCosecha: 6, distanciaPuertoKm: 300, hoy: HOY });
  assert.equal(c.camiones, 0);
  assert.ok(c.embolsadoras >= 1);
  assert.equal(c.aviso.nivel, 'critico');
});
