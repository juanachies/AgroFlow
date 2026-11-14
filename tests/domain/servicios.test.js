import assert from 'node:assert/strict';
import test from 'node:test';
import { datosFaltantes, serviciosPedidos, validarEntrada } from '../../src/domain/destino/servicios.js';

const entrada = {
  ha: 2000,
  qqHa: 35,
  cultivo: 'soja',
  diasDisponibles: 20,
  urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
  servicios: ['transporte', 'almacenaje'],
  destinos: [
    { tipo: 'silobolsa' },
    { tipo: 'puerto', distanciaKm: 300 },
  ],
};

test('detecta los datos que faltan', () => {
  assert.deepEqual(datosFaltantes({}), ['ha', 'qqHa', 'cultivo', 'diasDisponibles', 'urgencia', 'fechaInicioCosecha']);
  assert.deepEqual(datosFaltantes(entrada), []);
  assert.deepEqual(datosFaltantes({ ...entrada, destinos: [{ tipo: 'puerto' }, {}] }), [
    'destinos[0].distanciaKm',
    'destinos[1].tipo',
  ]);
  assert.deepEqual(datosFaltantes({ ...entrada, destinos: undefined }), [
    'destinos (hace falta para transporte y almacenaje)',
  ]);
});

test('la cosecha siempre está entre los servicios', () => {
  assert.deepEqual(serviciosPedidos({}), ['cosecha']);
  assert.deepEqual(serviciosPedidos({ servicios: ['transporte', 'cosecha'] }), ['cosecha', 'transporte']);
});

test('por defecto no hacen falta destinos', () => {
  const { servicios, destinos, ...soloCosecha } = entrada;
  assert.doesNotThrow(() => validarEntrada(soloCosecha));
});

test('un destino sin el servicio pedido se rechaza', () => {
  assert.throws(
    () => validarEntrada({ ...entrada, servicios: ['almacenaje'] }),
    /requiere pedir el servicio "transporte"/,
  );
});

test('servicios o destinos desconocidos se rechazan', () => {
  assert.throws(() => validarEntrada({ ...entrada, servicios: ['volar'] }), /servicio inválido: volar/);
  assert.throws(() => validarEntrada({ ...entrada, destinos: [{ tipo: 'luna', distanciaKm: 1 }] }), /tipo de destino inválido/);
  assert.throws(() => validarEntrada({ ha: 100 }), /faltan datos: qqHa/);
});
