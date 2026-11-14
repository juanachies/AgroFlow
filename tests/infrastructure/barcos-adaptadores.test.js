// Adaptadores de barcos: NABSA, BCR, CSV manual y simulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearLineupNABSA, nabsaALineup, toneladasProgramadas, crearBarcosNabsaAdapter } from '../../src/infrastructure/barcos/nabsaAdapter.js';
import { parsearBuquesBCR, parsearCamionesBCR } from '../../src/infrastructure/barcos/bcrAdapter.js';
import { parsearLineupCSV, crearBarcosManualAdapter } from '../../src/infrastructure/barcos/barcosManualAdapter.js';
import { simularLineup, crearBarcosSimuladosAdapter } from '../../src/infrastructure/barcos/barcosSimuladosAdapter.js';
import { analizarBarcos } from '../../src/domain/barcos/index.js';

const HOY = '2027-04-22';

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

test('CSV manual: parsea, valida y rechaza puertos inválidos', () => {
  const csv = 'buque;puerto;cultivo;toneladas;eta;estado\nMV Uno;gran-rosario;soja;40000;2027-04-25;anunciado\n';
  const lineup = parsearLineupCSV(csv);
  assert.equal(lineup.length, 1);
  assert.equal(lineup[0].toneladas, 40000);
  assert.throws(() => parsearLineupCSV('buque,puerto,cultivo,eta\nX,marte,soja,2027-01-01'), /puerto desconocido/);
  assert.throws(() => parsearLineupCSV('buque,puerto\nX,quequen'), /Faltan columnas/);
});

test('simulador reproducible y analizarBarcos completo', () => {
  const a = simularLineup({ hoy: HOY, semilla: 3 });
  assert.deepEqual(a, simularLineup({ hoy: HOY, semilla: 3 }));
  assert.ok(a.length > 0);
  const r = analizarBarcos({ lineup: a, puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY });
  assert.equal(r.senal.length, r.disponibilidad.dias.length);
  assert.ok(Array.isArray(r.avisos));
});

test('adaptadores como BarcosPort: calendario filtra por puerto y fechas; mercado de NABSA', async () => {
  const nabsa = crearBarcosNabsaAdapter({ texto: NABSA });
  const cal = await nabsa.calendario('gran-rosario', '2026-11-10', '2026-11-30');
  assert.ok(cal.every((b) => b.puerto === 'gran-rosario'));
  assert.ok(!cal.some((b) => b.eta === '2026-12-03')); // anunciado fuera del rango
  const m = await nabsa.mercado('gran-rosario', '2026-11-10');
  assert.equal(m.programadas.toneladas.maiz, 95000);
  assert.match(nabsa.origen, /NABSA 2026-11-10/);

  const manual = crearBarcosManualAdapter({ csv: 'buque,puerto,cultivo,toneladas,eta,estado\nA,quequen,trigo,30000,2027-04-25,anunciado\nB,gran-rosario,soja,40000,2027-04-25,anunciado', mercado: { camiones: { camiones: { soja: 100 } } } });
  assert.equal((await manual.calendario('quequen', HOY, '2027-05-30')).length, 1);
  assert.deepEqual(await manual.mercado(), { camiones: { camiones: { soja: 100 } } });

  const sim = crearBarcosSimuladosAdapter({ semilla: 3 });
  assert.deepEqual(await sim.calendario('gran-rosario', HOY), simularLineup({ puerto: 'gran-rosario', hoy: HOY, semilla: 3 }));
});
