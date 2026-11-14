// Parsers de fuentes reales (NABSA, BCR), índices de mercado y criterios para vender a puerto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearLineupNABSA, nabsaALineup, toneladasProgramadas,
  parsearBuquesBCR, parsearCamionesBCR,
  calcularIndicesMercado, demandaDiariaBarcos, analizarBarcos,
} from '../src/barcos/index.js';
import { evaluarIndicesPuerto, decidirVenta } from '../src/venta/index.js';
import { sumarDias } from '../src/comun/util.js';

// Extracto textual del line-up NABSA circular 210 (10/11/2026), tal como sale del PDF.
const NABSA = `Line Up: November 10, 2026  Circ.Nbr.: 210
Notes: REC (RECALADA PILOT STATION), AT CZONE (AT COMMON ZONE- LA PLATA ROADS), ETA (ESTIMATED TIME OF ARRIVAL), ETF (ESTIMATED TIME TO FINALIZE OPERATIONS).
Port Terminal Vessel ETA ETB ETF Ops Tons Commodity Destination Origin Charterer
DIAMANTE CARGILL (G.CARGO) NIL
SAN LORENZO RENOVA NORTH OTTO H ETF 10/11 load 23.000  SOYBEAN OIL INDIA ARGENTINA BUNGE
SAN LORENZO RENOVA NORTH ROMY ETA REC 10/11 load 29.700  WHEAT ECUADOR ARGENTINA BUNGE
SAN LORENZO RENOVA SOUTH NORTH ISLAND ETB load 35.200  SOYBEANMEAL NEW ZEALAND ARGENTINA BUNGE
SAN LORENZO RENOVA SOUTH EPIC HARMONY AT REC 10/11 load 36.300  SOYBEANMEAL SPAIN ARGENTINA BUNGE
SAN LORENZO DREYFUS TIMBUES MILOS I ETA REC 22/11 load 50.000  CORN VIETNAM ARGENTINA LDC
SAN LORENZO COFCO INTL. NORTH BERTH BORDEAUX ETF 15/11 discharge 33.000  AMSUL ARGENTINA NOT AVAILABLE NOT AVAILABLE
SAN LORENZO COFCO INTL. SOUTH BERTH KN PHOENIX ETF 11/11 load 45.000  CORN CHILE ARGENTINA NOT AVAILABLE
SAN LORENZO QUEBRACHO QUEEN LILA ETA REC 03/12 load 14.000  CORN SYRIA ARGENTINA NOT AVAILABLE
SAN LORENZO TERMINAL 6 NORTH BERTH XIN HAI TONG 812 (REJECTED) load 15.000 CORN SAUDI ARABIA ARGENTINA BUNGE
CAMPANA EUROAMERICA TERMINAL OSLO PACIFIC BERTHED load 5.970 RAW SUGAR UNITED STATES ARGENTINA SUCRO CAN SOURCING LLC`;

test('NABSA: fecha, estados, puertos, productos y fechas con año', () => {
  const n = parsearLineupNABSA(NABSA);
  assert.equal(n.fecha, '2026-11-10');
  assert.equal(n.circular, '210');
  assert.equal(n.filas.length, 9); // NIL y REJECTED se descartan
  const porBuque = Object.fromEntries(n.filas.map((f) => [f.terminalYBuque, f]));
  assert.equal(porBuque['RENOVA NORTH OTTO H'].estado, 'cargando');
  assert.equal(porBuque['RENOVA NORTH OTTO H'].producto, 'aceite-soja');
  assert.equal(porBuque['RENOVA SOUTH NORTH ISLAND'].estado, 'fondeado');
  assert.equal(porBuque['RENOVA SOUTH EPIC HARMONY'].estado, 'fondeado');
  assert.equal(porBuque['RENOVA SOUTH EPIC HARMONY'].referencia, 'AT REC');
  assert.equal(porBuque['QUEBRACHO QUEEN LILA'].fecha, '2026-12-03');
  assert.equal(porBuque['DREYFUS TIMBUES MILOS I'].toneladas, 50000);
  assert.equal(porBuque['DREYFUS TIMBUES MILOS I'].puerto, 'gran-rosario');
  assert.equal(porBuque['EUROAMERICA TERMINAL OSLO PACIFIC'].puerto, null);
  assert.equal(porBuque['EUROAMERICA TERMINAL OSLO PACIFIC'].estado, 'cargando');
  assert.throws(() => parsearLineupNABSA('sin fecha'), /Line Up/);
});

test('NABSA -> line-up de Barcos y toneladas programadas', () => {
  const n = parsearLineupNABSA(NABSA);
  const lineup = nabsaALineup(n);
  assert.deepEqual(lineup.map((b) => b.cultivo).sort(), ['maiz', 'maiz', 'maiz', 'trigo']);
  const r = analizarBarcos({ lineup, puerto: 'gran-rosario', cultivo: 'maiz', hoy: n.fecha });
  assert.equal(r.disponibilidad.barcosConsiderados, 3);
  const prog = toneladasProgramadas(n, 'gran-rosario', '2026-11-10', '2026-11-30');
  assert.equal(prog.toneladas.maiz, 95000); // 50.000 (22/11) + 45.000 (cargando); el del 03/12 queda afuera
  assert.equal(prog.toneladas['harina-soja'], 71500);
  assert.equal(prog.dias, 21);
});

test('BCR: buques a la carga y posición de camiones', () => {
  const buques = `Carga en buques programada del: 11/11/2026 al: 03/12/2026
Producto\tROS / SL\tNECOCHEA\tBAHIA BLANCA\tOtros puertos\tTotal
Trigo\t500.000\t+\t20.000\t=\t250.000\t22.300\t792.300
Maíz\t900.000\t30.000\t259.733\t0\t1.189.733
Soja\t400.000\t0\t43.400\t0\t443.400
Harinas\t1.400.000\t0\t73.250\t0\t1.473.250
Total\t3.200.000\t50.000\t626.383\t22.300\t3.898.683`;
  const b = parsearBuquesBCR(buques);
  assert.equal(b.desde, '2026-11-11');
  assert.equal(b.hasta, '2026-12-03');
  assert.equal(b.porPuerto['gran-rosario'].maiz, 900000);
  assert.equal(b.porPuerto['bahia-blanca'].trigo, 250000);
  assert.equal(b.porPuerto.total.harinas, 1473250);

  const cam = parsearCamionesBCR('Ingreso de camiones 13/11/26\nSoja;2.276;1.900\nMaíz;2.559;2.100\nTrigo;2.132;800\nTotal;6.967;4.800');
  assert.equal(cam.fecha, '2026-11-13');
  assert.equal(cam.camiones.maiz, 2559);
  assert.equal(cam.camiones.total, 6967);
});

test('índices: demanda/oferta con soja equivalente (grano + harina) y saturación', () => {
  const programadas = { desde: '2026-11-11', hasta: '2026-12-03', toneladas: { soja: 400000, maiz: 900000, harinas: 1400000 }, fuente: 'BCR' };
  const camiones = { fecha: '2026-11-13', camiones: { soja: 2276, maiz: 2559, total: 6967 }, fuente: 'BCR' };
  const dSoja = demandaDiariaBarcos('soja', programadas);
  assert.equal(dSoja.dias, 23);
  assert.ok(Math.abs(dSoja.toneladas - (400000 + 1400000 / 0.78)) < 1);
  const iSoja = calcularIndicesMercado({ cultivo: 'soja', puerto: 'gran-rosario', programadas, camiones });
  const iMaiz = calcularIndicesMercado({ cultivo: 'maiz', puerto: 'gran-rosario', programadas, camiones });
  assert.ok(iSoja.demandaOferta.valor > 1.1); // falta soja: los barcos (y la molienda) necesitan más de lo que entra
  assert.ok(iMaiz.demandaOferta.valor < 0.8); // sobra maíz respecto de lo programado
  assert.ok(Math.abs(iSoja.saturacion.valor - 6967 / 7000) < 0.01);
  // Saturación y nivel del Paraná solo aplican al Up-River.
  const bb = calcularIndicesMercado({ cultivo: 'maiz', puerto: 'bahia-blanca', camiones, nivelParanaM: 1 });
  assert.equal(bb.saturacion, undefined);
  assert.equal(bb.nivelParana, undefined);
});

test('criterios: verde, amarillo, rojo y bloqueantes', () => {
  const ok = evaluarIndicesPuerto({ demandaOferta: { valor: 1.4 }, espera: { valor: 0.5 }, saturacion: { valor: 0.7 } });
  assert.equal(ok.cumple, true);
  assert.equal(ok.semaforo, 'verde');
  const bloqueado = evaluarIndicesPuerto({ demandaOferta: { valor: 0.6 }, espera: { valor: 0.2 }, nivelParana: { valor: 3 } });
  assert.equal(bloqueado.cumple, false);
  assert.deepEqual(bloqueado.bloqueos, ['demandaOferta']);
  const negativo = evaluarIndicesPuerto({ espera: { valor: 2 }, saturacion: { valor: 0.95 }, nivelParana: { valor: 1.2 } });
  assert.equal(negativo.cumple, false); // sin bloqueos pero puntaje < 0
  const sinDatos = evaluarIndicesPuerto({});
  assert.equal(sinDatos.cumple, false);
  // Umbrales editables.
  assert.equal(evaluarIndicesPuerto({ demandaOferta: { valor: 0.7 } }, { demandaOferta: { rojo: 0.5, verde: 0.6 } }).cumple, true);
});

test('Venta: si el puerto no cumple los índices, elige acopio o silobolsa aunque el puerto dé más margen', () => {
  const HOY = '2026-11-14';
  const senal = Array.from({ length: 31 }, (_, d) => ({
    fecha: sumarDias(HOY, d), probHayBarco: 0.95, indiceDemanda: 1.1, factorPrecio: 1.003,
    capacidadT: 200000, esperaDias: 0.2, probBarcoEnTolerancia: 0.99, confiable: true, fuente: 'line-up',
  }));
  const barcos = { puerto: 'gran-rosario', cultivo: 'maiz', hoy: HOY, senal };
  const base = { barcos, cultivo: 'maiz', toneladas: 1000, fechaGranoListo: HOY, distanciaPuertoKm: 100, distanciaAcopioKm: 40 };

  const sinMercado = decidirVenta(base);
  assert.equal(sinMercado.canal, 'puerto');
  assert.equal(sinMercado.puertoHabilitado, true);

  const mercado = {
    programadas: { desde: HOY, hasta: sumarDias(HOY, 22), toneladas: { maiz: 900000 }, fuente: 'BCR' },
    camiones: { fecha: HOY, camiones: { maiz: 2559, total: 6967 }, fuente: 'BCR' },
  };
  const conMercado = decidirVenta({ ...base, mercado });
  assert.equal(conMercado.puertoHabilitado, false);
  assert.ok(conMercado.indicesPuerto.bloqueos.includes('demandaOferta'));
  assert.notEqual(conMercado.canal, 'puerto');
  assert.ok(conMercado.mejorPuerto.margenUSD > (conMercado.mejorVenta?.margenUSD ?? 0)); // el puerto daba más en el papel
  assert.match(conMercado.avisos.find((a) => a.tipo === 'indices-puerto').mensaje, /NO cumple/);
});
