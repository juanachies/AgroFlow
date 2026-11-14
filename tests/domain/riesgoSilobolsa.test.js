import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluarRiesgo } from '../../src/domain/silobolsa/riesgoSilobolsa.js';
import { tarifas } from '../helpers/tarifas.js';
import { lecturasCriticas, lecturasHumedadSube, lecturasLineales, lecturasSanas } from '../helpers/silobolsa.js';

test('grano sano y estable: riesgo bajo y sin fecha crítica', () => {
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: lecturasSanas }, tarifas);
  assert.equal(riesgo.nivel, 'bajo');
  assert.equal(riesgo.diasHastaCritico, null);
  assert.deepEqual(riesgo.motivos, []);
});

test('humedad en suba: riesgo medio y proyecta los días hasta el nivel alto', () => {
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: lecturasHumedadSube }, tarifas);
  assert.equal(riesgo.nivel, 'medio');
  assert.equal(riesgo.variables.humedad.pendientePorDia, 0.2);
  assert.equal(riesgo.diasHastaCritico, 5);
  assert.deepEqual(riesgo.motivos, ['humedad 15 (medio)']);
});

test('humedad, temperatura y CO2 pasados de umbral: riesgo alto y plazo 0', () => {
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: lecturasCriticas }, tarifas);
  assert.equal(riesgo.nivel, 'alto');
  assert.equal(riesgo.diasHastaCritico, 0);
  assert.equal(riesgo.motivos.length, 3);
});

test('toma como actual la lectura más reciente aunque lleguen desordenadas', () => {
  const desordenadas = [...lecturasHumedadSube].reverse();
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: desordenadas }, tarifas);
  assert.equal(riesgo.variables.humedad.valor, 15);
  assert.equal(riesgo.variables.humedad.pendientePorDia, 0.2);
});

test('proyecta los días hasta superar el umbral medio además del alto', () => {
  const lecturas = lecturasLineales({
    inicio: '2026-11-09T00:00:00Z',
    dias: 5,
    humedad: [12, 13],
    temperatura: [22, 22],
    co2: [2, 2],
  });
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas }, tarifas);
  assert.equal(riesgo.nivel, 'bajo');
  assert.equal(riesgo.diasHastaMedio, 5);
  assert.equal(riesgo.diasHastaCritico, 15);
});

test('un silobolsa ya en riesgo medio tiene plazo 0 hasta el nivel medio', () => {
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: lecturasHumedadSube }, tarifas);
  assert.equal(riesgo.diasHastaMedio, 0);
});

test('con una sola lectura evalúa el nivel pero no proyecta', () => {
  const riesgo = evaluarRiesgo({ cultivo: 'soja', lecturas: [lecturasHumedadSube[5]] }, tarifas);
  assert.equal(riesgo.nivel, 'medio');
  assert.equal(riesgo.diasHastaCritico, null);
});

test('el girasol tiene umbrales de humedad más estrictos que la soja', () => {
  const lecturas = [{ timestamp: '2026-11-07T00:00:00Z', humedad: 12, temperatura: 22, co2: 2 }];
  assert.equal(evaluarRiesgo({ cultivo: 'soja', lecturas }, tarifas).nivel, 'bajo');
  assert.equal(evaluarRiesgo({ cultivo: 'girasol', lecturas }, tarifas).nivel, 'medio');
});

test('una lectura con solo algunas variables usa las que trae', () => {
  const lecturas = [{ timestamp: '2026-11-07T00:00:00Z', co2: 9 }];
  const riesgo = evaluarRiesgo({ cultivo: 'maiz', lecturas }, tarifas);
  assert.equal(riesgo.nivel, 'alto');
  assert.deepEqual(Object.keys(riesgo.variables), ['co2']);
});

test('rechaza cultivo inválido, serie vacía y lectura sin variables', () => {
  assert.throws(() => evaluarRiesgo({ cultivo: 'quinoa', lecturas: lecturasSanas }, tarifas), /cultivo inválido/);
  assert.throws(() => evaluarRiesgo({ cultivo: 'soja', lecturas: [] }, tarifas), /al menos una medición/);
  assert.throws(
    () => evaluarRiesgo({ cultivo: 'soja', lecturas: [{ timestamp: '2026-11-07T00:00:00Z' }] }, tarifas),
    /no trae humedad/,
  );
});
