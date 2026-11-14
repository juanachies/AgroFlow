// Dominio de precios: spot, curva de futuros, base, precio esperado y curva de venta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirCurva, curvaDesdePrecios, precioEsperado, futuroEn, curvaDeVenta, spotDesdePizarra, vencimientoDePosicion, decidirVentaCosecha, decidirVenta } from '../../src/domain/venta/index.js';
import { tarifas } from '../helpers/tarifas.js';
import { barcos as barcosSilo, silobolsaSoja } from '../helpers/silobolsa.js';
import { sumarDias } from '../../src/domain/shared/util.js';

const HOY = '2026-11-14';

test('posiciones de futuros: vencimiento al último día del mes', () => {
  assert.equal(vencimientoDePosicion('MAY27'), '2027-05-31');
  assert.equal(vencimientoDePosicion('FEB28'), '2028-02-29');
  assert.equal(vencimientoDePosicion('DIC 2026'), '2026-12-31');
  assert.equal(vencimientoDePosicion('2027-07'), '2027-07-31');
  assert.throws(() => vencimientoDePosicion('XYZ'), /inválida/);
});

test('spot desde pizarra en pesos', () => {
  assert.equal(spotDesdePizarra({ pizarraARSt: 435000, tipoCambio: 1450 }), 300);
  assert.throws(() => spotDesdePizarra({ pizarraARSt: 435000 }), /tipoCambio/);
});

test('curva: ordena, descarta vencidas, calcula base e interpola', () => {
  const c = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 300 }, futuros: [
    { posicion: 'MAY27', precioUSDt: 296 }, { posicion: 'ENE27', precioUSDt: 306 }, { posicion: 'OCT26', precioUSDt: 290 },
  ] });
  assert.deepEqual(c.puntos.map((p) => p.posicion), ['ENE27', 'MAY27']);
  assert.equal(c.baseUSDt, -6);
  assert.equal(futuroEn(c, HOY), 306); // plano antes del primer vencimiento
  assert.equal(futuroEn(c, '2027-09-01'), 296); // plano después del último
  const medio = futuroEn(c, '2027-03-31');
  assert.ok(medio < 306 && medio > 296);
  // La base converge a 0 al vencimiento de la posición cercana.
  assert.equal(precioEsperado(c, HOY).precioUSDt, 300);
  assert.equal(precioEsperado(c, '2027-01-31').baseUSDt, 0);
  assert.equal(precioEsperado(c, '2027-01-31').precioUSDt, 306);
});

test('curva de venta: mercado invertido -> vender ya; con carry alto -> esperar', () => {
  const invertida = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 300 }, futuros: [{ posicion: 'ENE27', precioUSDt: 299 }, { posicion: 'MAY27', precioUSDt: 290 }] });
  assert.equal(curvaDeVenta({ curva: invertida }).venderYa, true);

  const conCarry = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 280 }, futuros: [{ posicion: 'DIC26', precioUSDt: 282 }, { posicion: 'MAR27', precioUSDt: 305 }] });
  const v = curvaDeVenta({ curva: conCarry, costos: { fijoUSDt: 0, mermaMensual: 0.003, tasaMensual: 0.005 } });
  assert.equal(v.venderYa, false);
  assert.ok(v.mejor.meses >= 3);
  assert.ok(v.gananciaEsperarUSDt > 0);
  // Con merma alta (bolsa en riesgo) el mismo mercado ya no paga esperar.
  assert.equal(curvaDeVenta({ curva: conCarry, costos: { fijoUSDt: 0, mermaMensual: 0.03, tasaMensual: 0.005 } }).venderYa, true);
  // El precio de equilibrio de cada mes cubre exactamente costo + merma.
  const f = v.filas[2];
  assert.ok(Math.abs(f.precioEquilibrioUSDt * (1 - f.mermaPct / 100) - f.costoGuardarUSDt - 280) < 0.05);
});

test('decidirVentaCosecha con curva de precios: spot real y mejor mes de silobolsa', () => {
  const senal = Array.from({ length: 31 }, (_, d) => ({ fecha: sumarDias(HOY, d), probHayBarco: 0.95, indiceDemanda: 1, factorPrecio: 1, capacidadT: 1e5, esperaDias: 0.2, probBarcoEnTolerancia: 0.99, confiable: true, fuente: 'line-up' }));
  const barcos = { puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, senal };
  const curvaPrecios = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 280 }, futuros: [{ posicion: 'DIC26', precioUSDt: 282 }, { posicion: 'MAY27', precioUSDt: 330 }] });
  const r = decidirVentaCosecha({ barcos, cultivo: 'soja', toneladas: 1000, fechaGranoListo: HOY, distanciaPuertoKm: 100, curvaPrecios });
  assert.equal(r.mejorPuerto.detalle.detalle.precioUSDt, 280);
  assert.equal(r.silobolsa.detalle.alternativas.length, 6);
  assert.ok(r.silobolsa.detalle.mesesGuardado >= 4); // el carry fuerte premia guardar hasta mayo
  assert.equal(r.decision, 'silobolsa');
});

test('formato de PreciosPort: { spot, futuros: [{ mes, precio }] }', () => {
  const c = curvaDesdePrecios(HOY, { spot: 300, futuros: [{ mes: '2026-12', precio: 320 }] });
  assert.equal(c.cercano.vencimiento, '2026-12-31');
  assert.equal(c.baseUSDt, -20);
  assert.throws(() => curvaDesdePrecios(HOY, { spot: 0 }), /spot/);
});

test('venta de silobolsa eligiendo barco: precio de entrega según la curva, no solo el futuro del mes', () => {
  const precio = { spot: 300, futuros: [{ mes: '2026-12', precio: 320 }, { mes: '2027-02', precio: 330 }] };
  const base = { silobolsa: silobolsaSoja, riesgo: { nivel: 'bajo', diasHastaCritico: null }, precio, barcos: barcosSilo, destino: { terminal: 'Puerto Gran Rosario', distanciaKm: 300 }, hoy: HOY, tasaAnual: 0.08 };
  const r = decidirVenta(base, tarifas);
  const nov = r.evaluados.find((e) => e.barcoId === 'barco-noviembre');
  const dic = r.evaluados.find((e) => e.barcoId === 'barco-diciembre');
  // Noviembre ya no cobra el spot plano: la base (−20) converge hacia el futuro de diciembre.
  assert.ok(nov.precioUsdPorT > 300 && nov.precioUsdPorT < 320);
  assert.ok(dic.precioUsdPorT > nov.precioUsdPorT);
  assert.equal(r.elegido.barcoId, 'barco-diciembre');
});
