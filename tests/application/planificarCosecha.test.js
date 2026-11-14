import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { dimensionarCosecha } from '../../src/domain/maquinaria/dimensionarCosecha.js';
import { tarifas, tarifasSimuladas } from '../helpers/tarifas.js';

const { planificarCosecha, compararDestinos } = crearContenedor({ tarifas: tarifasSimuladas });

const silobolsa = { nombre: 'Silobolsa en el campo', tipo: 'silobolsa' };
const acopio = { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 40, costoAdicionalUsdPorT: 6 };
const puerto = { nombre: 'Puerto Gran Rosario', tipo: 'puerto', distanciaKm: 300 };

const base = {
  ha: 2000,
  qqHa: 35,
  cultivo: 'soja',
  diasDisponibles: 20,
  urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
};
const todos = { ...base, servicios: ['transporte', 'almacenaje'], destinos: [silobolsa, acopio, puerto] };
const soloPuerto = { ...base, servicios: ['transporte'], destinos: [puerto] };
const soloSilobolsa = { ...base, servicios: ['almacenaje'], destinos: [silobolsa] };
const conPrecios = (precios) => ({
  ...todos,
  destinos: todos.destinos.map((destino, i) => ({ ...destino, precioUsdPorT: precios[i] })),
});
const pedido = (plan, recurso) => plan.recomendado.pedidos.find((p) => p.recurso === recurso);

test('sin precios recomienda el destino de menor costo', async () => {
  const plan = await planificarCosecha(todos);
  assert.match(plan.recomendado.criterio, /menor costo/);
  assert.equal(plan.recomendado.costo_usd, Math.min(...plan.alternativas.map((a) => a.costo_usd)));
  assert.equal(plan.recomendado.margen_usd, null);
});

test('con precios recomienda el mayor margen aunque no sea el más barato', async () => {
  const plan = await planificarCosecha(conPrecios([300, 300, 400]));
  assert.match(plan.recomendado.criterio, /mayor margen/);
  assert.equal(plan.recomendado.destino, 'Puerto Gran Rosario');
  assert.equal(plan.recomendado.margen_usd, Math.max(...plan.alternativas.map((a) => a.margen_usd)));
});

test('compararDestinos devuelve cada alternativa evaluada y la mejor', async () => {
  const { evaluados, mejor } = await compararDestinos(todos);
  assert.equal(evaluados.length, 3);
  assert.ok(evaluados.includes(mejor));
});

test('los pedidos coinciden con el dimensionado de la cosecha', async () => {
  const plan = await planificarCosecha(soloPuerto);
  const r = dimensionarCosecha({ ...base, destino: 'puerto', distanciaKm: 300 }, tarifas);
  assert.equal(pedido(plan, 'cosechadora').cantidad, r.cosechadoras.cantidad);
  assert.equal(pedido(plan, 'cosechadora').tipo, r.cosechadoras.id);
  assert.equal(pedido(plan, 'camión').cantidad, r.camiones.elegido.cantidad);
  assert.equal(pedido(plan, 'embolsadora'), undefined);
  assert.equal(plan.toneladas, 7000);
});

test('el almacenaje pide embolsadora y bolsas, no camiones', async () => {
  const plan = await planificarCosecha(soloSilobolsa);
  assert.equal(pedido(plan, 'camión'), undefined);
  assert.equal(pedido(plan, 'silobolsa').cantidad, Math.ceil(7000 / tarifas.silobolsa.por_cultivo.soja.capacidad_t));
  assert.equal(pedido(plan, 'silobolsa').servicio, 'almacenaje');
  assert.ok(plan.recomendado.costo_extraccion_usd > 0);
});

test('por defecto solo se contrata la cosecha y no hacen falta destinos', async () => {
  const plan = await planificarCosecha(base);
  assert.deepEqual(plan.servicios, ['cosecha']);
  assert.deepEqual(plan.recomendado.pedidos.map((p) => p.recurso), ['cosechadora', 'tractor con tolva']);
  assert.deepEqual(Object.keys(plan.recomendado.costos_por_servicio), ['cosecha']);
  assert.equal(plan.recomendado.destino, null);
});

test('menos días nunca piden menos cosechadoras', async () => {
  const holgado = await planificarCosecha(soloPuerto);
  const apretado = await planificarCosecha({ ...soloPuerto, diasDisponibles: 8 });
  assert.ok(pedido(apretado, 'cosechadora').cantidad >= pedido(holgado, 'cosechadora').cantidad);
});

test('sin datos completos no hay plan', async () => {
  await assert.rejects(planificarCosecha({ ha: 100 }), /faltan datos: qqHa/);
  await assert.rejects(planificarCosecha({ ...todos, destinos: [] }), /hace falta para transporte y almacenaje/);
  await assert.rejects(planificarCosecha({ ...soloPuerto, fechaInicioCosecha: 'mañana' }), /fecha inválida/);
});

test('el caso de uso usa el puerto de tarifas que se le inyecta', async () => {
  let consultas = 0;
  const espia = { vigentes: async () => (consultas += 1, tarifas) };
  const contenedor = crearContenedor({ tarifas: espia });
  await contenedor.planificarCosecha(base);
  assert.ok(consultas >= 1);
});
