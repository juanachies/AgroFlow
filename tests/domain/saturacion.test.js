// Dominio Saturación del puerto: flujo reservado, pronóstico y mejor ventana de entrega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flujoReservado, pronosticarSaturacion, mejorVentanaDeEntrega } from '../../src/domain/saturacion/index.js';
import { sumarDias } from '../../src/domain/shared/util.js';

const HOY = '2027-04-01';
const senal = (n, f = () => ({})) => Array.from({ length: n }, (_, d) => ({ fecha: sumarDias(HOY, d), capacidadT: 300000, esperaDias: 0.2, probBarcoEnTolerancia: 0.95, ...f(d) }));
const camiones = (fecha, unidades, extra = {}) => ({ recurso: 'camión', puerto: 'gran-rosario', unidades, viajesPorDia: 1, capacidadT: 30, desde: fecha, hasta: fecha, ...extra });

test('flujo reservado: solo camiones al puerto pedido, por viajes y capacidad', () => {
  const f = flujoReservado([
    camiones('2027-04-02', 10, { viajesPorDia: 2, capacidadT: 40 }),
    camiones('2027-04-02', 5, { puerto: 'quequen' }),
    { recurso: 'cosechadora', unidades: 3, desde: '2027-04-02', hasta: '2027-04-02' },
  ], { puerto: 'gran-rosario', desde: HOY, hasta: '2027-04-03' });
  assert.deepEqual(f.map((x) => [x.camiones, x.toneladas]), [[0, 0], [20, 800], [0, 0]]);
});

test('pronóstico: reservas escaladas por participación; estados por saturación y espera', () => {
  const reservas = [camiones('2027-04-02', 150), camiones('2027-04-03', 280), camiones('2027-04-04', 400)]; // ÷0,05 = 3.000, 5.600, 8.000
  const p = pronosticarSaturacion({ barcos: { puerto: 'gran-rosario', senal: senal(6, (d) => (d === 5 ? { esperaDias: 4 } : {})) }, reservas });
  const e = Object.fromEntries(p.dias.map((d) => [d.fecha, d]));
  assert.equal(e['2027-04-02'].camionesEsperados, 3000);
  assert.equal(e['2027-04-02'].fuenteCamiones, 'reservas del marketplace');
  assert.equal(e['2027-04-02'].estado, 'fluido');
  assert.equal(e['2027-04-03'].estado, 'cargado'); // 5.600 / 7.000 = 0,8
  assert.equal(e['2027-04-04'].estado, 'saturado');
  assert.equal(e['2027-04-01'].fuenteCamiones, 'sin dato');
  assert.equal(e['2027-04-06'].estado, 'saturado'); // sin camiones, la espera de 4 días satura
  assert.deepEqual(p.diasSaturados, ['2027-04-04', '2027-04-06']);
});

test('pronóstico: dato publicado si no hay reservas; demanda ÷ oferta solo con participación del cultivo', () => {
  const sinCultivo = pronosticarSaturacion({ barcos: { puerto: 'gran-rosario', senal: senal(2) }, camionesPublicadosDia: 5000 });
  assert.equal(sinCultivo.dias[0].fuenteCamiones, 'dato publicado del día');
  assert.equal(sinCultivo.dias[0].demandaOferta, null);
  const conCultivo = pronosticarSaturacion({ barcos: { puerto: 'gran-rosario', senal: senal(2) }, camionesPublicadosDia: 5000, params: { participacionCultivo: 0.4 } });
  // 300.000 t / 5 días = 60.000 t/día contra 5.000 × 0,4 × 30 = 60.000 t/día
  assert.equal(conCultivo.dias[0].demandaOferta, 1);
  assert.equal(conCultivo.dias[0].estado, 'cargado'); // 1 < 1,1
});

test('mejor ventana de entrega: corre el despacho para evitar los días saturados', () => {
  const dias = Array.from({ length: 30 }, (_, d) => ({ fecha: sumarDias(HOY, d), estado: d >= 8 && d <= 12 ? 'saturado' : d === 13 ? 'cargado' : 'fluido' }));
  const v = mejorVentanaDeEntrega({ pronostico: { dias }, desde: '2027-04-09', duracion: 4, margenDias: 10 });
  assert.equal(v.diasSaturadosOriginal, 4);
  assert.equal(v.diasSaturados, 0);
  assert.equal(v.inicio, '2027-04-05'); // el más cercano sin saturación: 4 días antes
  const soloDespues = mejorVentanaDeEntrega({ pronostico: { dias }, desde: '2027-04-09', duracion: 4, margenDias: 10, noAntesDe: '2027-04-09' });
  assert.equal(soloDespues.inicio, '2027-04-15');
  assert.equal(mejorVentanaDeEntrega({ pronostico: { dias }, desde: '2027-06-01', duracion: 3 }), null);
});
