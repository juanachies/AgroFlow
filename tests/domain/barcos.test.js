// Tests del dominio Barcos (puro: sin red, sin archivos, no importa Venta ni Cadetes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  factorCalado,
  predecirDisponibilidad,
  esperaEsperada,
  riesgoPerderBarco,
  senalPorDia,
  avisosBarcos,
  analizarBarcos,
} from '../../src/domain/barcos/index.js';
import { normalCDF, sumarDias, diasEntre } from '../../src/domain/shared/util.js';

const HOY = '2027-04-22';

test('utilidades de fecha y normal', () => {
  assert.equal(sumarDias('2027-02-27', 3), '2027-03-02');
  assert.equal(diasEntre('2027-04-22', '2027-05-02'), 10);
  assert.ok(Math.abs(normalCDF(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCDF(1.96) - 0.975) < 1e-3);
});

test('calado: la bajante del Paraná reduce la carga solo en puertos del río', () => {
  const normal = factorCalado('gran-rosario', 3.5);
  const bajante = factorCalado('gran-rosario', 1.5);
  assert.equal(normal.factor, 1);
  assert.ok(bajante.factor < 0.9);
  assert.ok(bajante.caladoPies < normal.caladoPies);
  assert.equal(factorCalado('bahia-blanca', 0.5).factor, 1);
});

test('sin line-up el pronóstico es puramente estacional y mayor en temporada alta', () => {
  const mayo = predecirDisponibilidad({ puerto: 'gran-rosario', cultivo: 'soja', hoy: '2027-05-01', horizonteDias: 10 });
  const enero = predecirDisponibilidad({ puerto: 'gran-rosario', cultivo: 'soja', hoy: '2027-01-01', horizonteDias: 10 });
  assert.ok(mayo.dias.every((d) => d.fuente === 'estacional'));
  assert.ok(mayo.dias[9].probHayBarco > enero.dias[9].probHayBarco);
});

test('el line-up concentra la probabilidad alrededor de la ETA', () => {
  const lineup = [{ buque: 'A', puerto: 'quequen', cultivo: 'trigo', toneladas: 40000, eta: '2027-04-30', estado: 'anunciado' }];
  const disp = predecirDisponibilidad({ lineup, puerto: 'quequen', cultivo: 'trigo', hoy: HOY, horizonteDias: 30 });
  const pico = disp.dias.reduce((a, d) => (d.arribosEsperados > a.arribosEsperados ? d : a));
  const offset = diasEntre('2027-04-30', pico.fecha);
  assert.ok(offset >= 0 && offset <= 3, `pico en ${pico.fecha}`);
  const cargando = predecirDisponibilidad({
    lineup: [{ buque: 'B', puerto: 'quequen', cultivo: 'trigo', eta: '2027-04-21', estado: 'cargando' }],
    puerto: 'quequen', cultivo: 'trigo', hoy: HOY, horizonteDias: 10,
  });
  assert.ok(cargando.dias[0].probHayBarco > 0.6);
});

test('índice de demanda y factor de precio; capacidad con toneladas declaradas', () => {
  const muchos = Array.from({ length: 8 }, (_, i) => ({ buque: `B${i}`, puerto: 'quequen', cultivo: 'soja', toneladas: 50000, eta: '2027-04-21', estado: 'cargando' }));
  const conDemanda = predecirDisponibilidad({ lineup: muchos, puerto: 'quequen', cultivo: 'soja', hoy: HOY, horizonteDias: 10 });
  const sinBarcos = predecirDisponibilidad({ lineup: [{ buque: 'X', puerto: 'quequen', cultivo: 'trigo', eta: '2027-05-30' }], puerto: 'quequen', cultivo: 'soja', hoy: HOY, horizonteDias: 10 });
  assert.ok(conDemanda.dias[0].indiceDemanda > 1);
  assert.ok(sinBarcos.dias[0].indiceDemanda < 1);
  assert.ok(conDemanda.dias[0].factorPrecio > 1 && conDemanda.dias[0].factorPrecio <= 1.03);
  assert.ok(sinBarcos.dias[0].factorPrecio < 1);
  assert.ok(conDemanda.dias[0].capacidadT >= 8 * 50000);
});

test('espera esperada: más barcos, menos espera', () => {
  const pocos = predecirDisponibilidad({ puerto: 'quequen', cultivo: 'soja', hoy: '2027-01-10', horizonteDias: 60 });
  const muchos = predecirDisponibilidad({ puerto: 'gran-rosario', cultivo: 'maiz', hoy: '2027-05-10', horizonteDias: 60 });
  const ep = esperaEsperada(pocos, '2027-01-12');
  const em = esperaEsperada(muchos, '2027-05-12');
  assert.ok(ep.esperaDias > em.esperaDias);
  assert.ok(em.probBarcoEnTolerancia > ep.probBarcoEnTolerancia);
  assert.equal(esperaEsperada(muchos, '2028-01-01'), null);
});

test('señal por día: una entrada por día con espera y factor de precio', () => {
  const disp = predecirDisponibilidad({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, horizonteDias: 20 });
  const senal = senalPorDia(disp);
  assert.equal(senal.length, 21);
  for (const s of senal) {
    assert.ok(typeof s.esperaDias === 'number' && typeof s.factorPrecio === 'number' && typeof s.confiable === 'boolean');
  }
});

test('riesgo de perder un barco crece si el grano llega tarde', () => {
  const barco = { buque: 'X', puerto: 'gran-rosario', cultivo: 'soja', eta: '2027-04-25', estado: 'anunciado' };
  const temprano = riesgoPerderBarco({ barco, fechaLlegadaGrano: '2027-04-24' });
  const tarde = riesgoPerderBarco({ barco, fechaLlegadaGrano: '2027-05-05' });
  assert.ok(temprano.probPerderBarco < 0.05);
  assert.ok(tarde.probPerderBarco > 0.5);
  assert.ok(temprano.probEsperarBarco > tarde.probEsperarBarco);
});

test('avisos de barcos: bajante siempre; disponibilidad y perder barco con fecha de llegada', () => {
  const barco = { buque: 'Apurado', puerto: 'gran-rosario', cultivo: 'soja', eta: '2027-04-21', estado: 'cargando' };
  const disp = predecirDisponibilidad({ lineup: [barco], puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, nivelParanaM: 1.5 });
  assert.deepEqual(avisosBarcos({ disponibilidad: disp }).map((a) => a.tipo), ['bajante']);
  const avisos = avisosBarcos({ disponibilidad: disp, fechaLlegada: '2027-05-01', barcoContratado: barco });
  const tipos = avisos.map((a) => a.tipo);
  assert.ok(tipos.includes('bajante') && tipos.includes('perder-barco'));
  assert.equal(avisos[0].nivel, 'critico');
  assert.ok(avisos.every((a) => a.modulo === 'barcos'));
  assert.equal(avisosBarcos({ disponibilidad: disp, fechaLlegada: '2028-01-01' }).at(-1).tipo, 'fuera-de-horizonte');
});
