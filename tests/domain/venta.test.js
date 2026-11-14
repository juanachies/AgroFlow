// Tests del módulo Venta. Usa una señal de barcos armada a mano para aislarlo de Barcos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirVentaCosecha } from '../../src/domain/venta/index.js';
import { analizarBarcos } from '../../src/domain/barcos/index.js';
import { sumarDias } from '../../src/domain/shared/util.js';

const HOY = '2027-04-22';

// Señal sintética: espera y factor de precio por día.
function barcosFalsos({ dias = 30, espera = () => 0, factor = () => 1 } = {}) {
  const senal = Array.from({ length: dias + 1 }, (_, d) => ({
    fecha: sumarDias(HOY, d), probHayBarco: 0.9, indiceDemanda: 1, factorPrecio: factor(d),
    capacidadT: 100000, esperaDias: espera(d), probBarcoEnTolerancia: 0.95, confiable: true, fuente: 'line-up',
  }));
  return { puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, senal };
}

const base = { cultivo: 'soja', toneladas: 1000, fechaGranoListo: HOY, distanciaPuertoKm: 100 };

test('puerto fluido y cerca: conviene vender al puerto', () => {
  const r = decidirVentaCosecha({ ...base, barcos: barcosFalsos() });
  assert.equal(r.decision, 'vender');
  assert.equal(r.canal, 'puerto');
  assert.equal(r.mejorVenta.despacho, HOY);
  assert.ok(r.mejorVenta.margenUSD > r.silobolsa.margenUSD);
});

test('futuro alto: conviene silobolsa y explica qué tendría que pasar para vender', () => {
  const r = decidirVentaCosecha({ ...base, barcos: barcosFalsos(), precios: { futuroUSDt: 360 } });
  assert.equal(r.decision, 'silobolsa');
  assert.equal(r.canal, null);
  assert.ok(r.hastaDondeRinde.precioPuertoMinimoUSDt > 300);
  assert.equal(r.hastaDondeRinde.ventanaVenta, null);
  assert.match(r.avisos.find((a) => a.tipo === 'decision-venta').mensaje, /silobolsa/);
});

test('cola en puerto los primeros días: posterga el despacho y avisa', () => {
  const espera = (d) => (d < 5 ? 6 : 0);
  const r = decidirVentaCosecha({ ...base, barcos: barcosFalsos({ espera }) });
  assert.equal(r.decision, 'vender');
  assert.ok(r.mejorVenta.despacho > HOY);
  assert.ok(r.avisos.some((a) => a.tipo === 'cola'));
});

test('hasta dónde rinde: la ventana de venta se cierra cuando la demanda de barcos cae', () => {
  // Precio cae 5% a partir del día 4 (menos barcos): vender deja de rendir frente a la silobolsa.
  const factor = (d) => (d < 4 ? 1.03 : 0.95);
  const r = decidirVentaCosecha({ ...base, barcos: barcosFalsos({ factor }), precios: { puertoHoyUSDt: 300, futuroUSDt: 312 } });
  const v = r.hastaDondeRinde.ventanaVenta;
  assert.ok(v);
  assert.equal(v.desde, HOY);
  assert.equal(v.hasta, sumarDias(HOY, 3));
  assert.equal(v.abiertaAlFinal, false);
  assert.ok(r.avisos.some((a) => a.tipo === 'cierre-ventana'));
});

test('espera máxima tolerable y precio futuro de equilibrio son coherentes', () => {
  const r = decidirVentaCosecha({ ...base, barcos: barcosFalsos() });
  const h = r.hastaDondeRinde;
  assert.ok(h.esperaMaxDias > 0);
  // Con una espera mayor a la máxima, la silobolsa gana.
  const conEspera = decidirVentaCosecha({ ...base, barcos: barcosFalsos({ espera: () => h.esperaMaxDias + 2 }) });
  assert.equal(conEspera.decision, 'silobolsa');
  // Con un futuro mayor al de equilibrio, la silobolsa gana.
  const conFuturo = decidirVentaCosecha({ ...base, barcos: barcosFalsos(), precios: { futuroUSDt: h.precioFuturoEquilibrioUSDt + 1 } });
  assert.equal(conFuturo.decision, 'silobolsa');
});

test('acopio cercano le gana a un puerto lejano', () => {
  const r = decidirVentaCosecha({ ...base, distanciaPuertoKm: 450, distanciaAcopioKm: 20, barcos: barcosFalsos() });
  assert.equal(r.canal, 'acopio');
});

test('integra con la salida real de analizarBarcos', () => {
  const barcos = analizarBarcos({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY });
  const r = decidirVentaCosecha({ ...base, barcos });
  assert.ok(['vender', 'silobolsa'].includes(r.decision));
  assert.ok(r.curva.length > 0);
  assert.throws(() => decidirVentaCosecha({ ...base, barcos: {} }), /analizarBarcos/);
});
