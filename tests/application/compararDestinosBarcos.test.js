// Elegir destino con los barcos del puerto (BarcosPort): precio por demanda, espera e índices.
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { ajustarDestinoPuerto } from '../../src/domain/destino/barcosDelPuerto.js';
import { elegirDestino } from '../../src/domain/destino/comparadorDestinos.js';
import { tarifasSimuladas } from '../helpers/tarifas.js';
import { sumarDias } from '../../src/domain/shared/util.js';

const HOY = '2027-04-10';
const acopio = { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 40, costoAdicionalUsdPorT: 6, precioUsdPorT: 290 };
const puerto = { nombre: 'Puerto Gran Rosario', tipo: 'puerto', distanciaKm: 300, precioUsdPorT: 330 };
const entrada = {
  ha: 2000, qqHa: 35, cultivo: 'maiz', diasDisponibles: 20, urgencia: 'media',
  fechaInicioCosecha: HOY, servicios: ['transporte'], destinos: [acopio, puerto],
};

// Muchos barcos de maíz cargando: el puerto fluye y no hay espera.
const lineupFluido = Array.from({ length: 10 }, (_, i) => ({ buque: `B${i}`, puerto: 'gran-rosario', cultivo: 'maiz', toneladas: 50000, eta: sumarDias(HOY, -1), estado: 'cargando' }));
const barcosPort = (lineup, mercado = {}) => ({
  origen: 'test',
  calendario: async () => lineup,
  mercado: async () => mercado,
});
// Datos BCR: entra mucho más maíz en camión del que los barcos necesitan (demanda ÷ oferta = 0,6).
const mercadoSaturado = {
  programadas: { desde: HOY, hasta: sumarDias(HOY, 19), toneladas: { maiz: 600000 }, fuente: 'test' },
  camiones: { fecha: HOY, camiones: { maiz: 1667, total: 4000 }, fuente: 'test' },
};

test('sin BarcosPort, compararDestinos no cambia (puerto con más margen gana)', async () => {
  const { compararDestinos } = crearContenedor({ tarifas: tarifasSimuladas });
  const r = await compararDestinos(entrada);
  assert.equal(r.mejor.destino, 'Puerto Gran Rosario');
  assert.equal(r.mejor.barcos, undefined);
});

test('con barcos y puerto fluido: el puerto cumple los índices y se informa la señal', async () => {
  const { compararDestinos } = crearContenedor({ tarifas: tarifasSimuladas, barcos: barcosPort(lineupFluido) });
  const r = await compararDestinos(entrada);
  assert.equal(r.mejor.destino, 'Puerto Gran Rosario');
  assert.equal(r.mejor.habilitado, true);
  assert.equal(r.mejor.barcos.puerto, 'gran-rosario');
  assert.ok(r.mejor.barcos.esperaDias < 1);
  assert.deepEqual(r.descartados, []);
});

test('con datos de mercado saturados: el puerto no cumple, se descarta y gana el acopio', async () => {
  const { compararDestinos } = crearContenedor({ tarifas: tarifasSimuladas, barcos: barcosPort(lineupFluido, mercadoSaturado) });
  const r = await compararDestinos(entrada);
  const p = r.evaluados.find((e) => e.tipo === 'puerto');
  assert.equal(p.habilitado, false);
  assert.ok(p.barcos.indicesPuerto.bloqueos.includes('demandaOferta'));
  assert.ok(p.margen_usd > r.mejor.margen_usd); // el puerto daba más en el papel
  assert.equal(r.mejor.destino, 'Cooperativa local');
  assert.match(r.criterio, /puerto descartado por índices de barcos/);
});

test('ajuste del destino puerto: precio por demanda y espera como costo adicional', () => {
  const senal = [{ fecha: HOY, probHayBarco: 0.4, indiceDemanda: 0.5, factorPrecio: 0.985, capacidadT: 1, esperaDias: 2.5, probBarcoEnTolerancia: 0.6, confiable: true, fuente: 'line-up' }];
  const d = ajustarDestinoPuerto({ destino: { ...puerto, costoAdicionalUsdPorT: 1 }, barcos: { puerto: 'gran-rosario', senal }, fechaLlegada: HOY, cultivo: 'maiz', costoEsperaUsdPorTDia: 1.2 });
  assert.equal(d.precioUsdPorT, 325.05);
  assert.equal(d.costoAdicionalUsdPorT, 4);
  assert.equal(d.barcos.esperaDias, 2.5);
  // Acopio y silobolsa no se tocan.
  assert.equal(ajustarDestinoPuerto({ destino: acopio, barcos: { senal } }), acopio);
});

test('si todos los destinos están descartados, igual elige entre ellos', () => {
  const r = elegirDestino([{ destino: 'P', habilitado: false, margen_usd: 10, costo_usd: 1 }]);
  assert.equal(r.mejor.destino, 'P');
});
