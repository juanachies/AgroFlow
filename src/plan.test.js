const test = require('node:test');
const assert = require('node:assert/strict');
const { planDePedido, datosFaltantes } = require('./plan');
const { dimensionarCosecha } = require('./dimensionar');

const entrada = {
  ha: 2000,
  qqHa: 35,
  cultivo: 'soja',
  diasDisponibles: 20,
  urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
  servicios: ['transporte', 'almacenaje'],
  destinos: [
    { nombre: 'Silobolsa en el campo', tipo: 'silobolsa' },
    { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 40, costoAdicionalUsdPorT: 6 },
    { nombre: 'Puerto Gran Rosario', tipo: 'puerto', distanciaKm: 300 },
  ],
};

const pedido = (plan, recurso) => plan.recomendado.pedidos.find((p) => p.recurso === recurso);
const soloPuerto = { ...entrada, servicios: ['transporte'], destinos: [entrada.destinos[2]] };
const soloSilobolsa = { ...entrada, servicios: ['almacenaje'], destinos: [entrada.destinos[0]] };

test('detecta los datos que faltan', () => {
  assert.deepEqual(datosFaltantes({}), [
    'ha', 'qqHa', 'cultivo', 'diasDisponibles', 'urgencia', 'fechaInicioCosecha',
  ]);
  const faltan = datosFaltantes({ ...entrada, destinos: [{ tipo: 'puerto' }, {}] });
  assert.deepEqual(faltan, ['destinos[0].distanciaKm', 'destinos[1].tipo']);
  assert.deepEqual(datosFaltantes(entrada), []);
  assert.deepEqual(datosFaltantes({ ...entrada, destinos: undefined }), [
    'destinos (hace falta para transporte y almacenaje)',
  ]);
});

test('sin datos completos no hay plan', () => {
  assert.throws(() => planDePedido({ ha: 100 }), /faltan datos: qqHa/);
  assert.throws(() => planDePedido({ ...entrada, destinos: [] }), /hace falta para transporte y almacenaje/);
});

test('sin precios recomienda el destino de menor costo', () => {
  const plan = planDePedido(entrada);
  const menor = Math.min(...plan.alternativas.map((a) => a.costo_usd));
  assert.match(plan.recomendado.criterio, /menor costo/);
  assert.equal(plan.recomendado.costo_usd, menor);
  assert.equal(plan.recomendado.margen_usd, null);
});

test('con precios recomienda el mayor margen aunque no sea el más barato', () => {
  const conPrecios = {
    ...entrada,
    destinos: [
      { ...entrada.destinos[0], precioUsdPorT: 300 },
      { ...entrada.destinos[1], precioUsdPorT: 300 },
      { ...entrada.destinos[2], precioUsdPorT: 400 },
    ],
  };
  const plan = planDePedido(conPrecios);
  assert.match(plan.recomendado.criterio, /mayor margen/);
  assert.equal(plan.recomendado.destino, 'Puerto Gran Rosario');
  const mayor = Math.max(...plan.alternativas.map((a) => a.margen_usd));
  assert.equal(plan.recomendado.margen_usd, mayor);
});

test('los pedidos coinciden con el dimensionado de la cosecha', () => {
  const plan = planDePedido(soloPuerto);
  const r = dimensionarCosecha({ ...entrada, destino: 'puerto', distanciaKm: 300 });
  assert.equal(pedido(plan, 'cosechadora').cantidad, r.cosechadoras.cantidad);
  assert.equal(pedido(plan, 'cosechadora').tipo, r.cosechadoras.id);
  assert.equal(pedido(plan, 'camión').cantidad, r.camiones.elegido.cantidad);
  assert.equal(pedido(plan, 'embolsadora'), undefined);
  assert.equal(plan.toneladas, 7000);
});

test('un destino silobolsa pide bolsas y embolsadora, no camiones', () => {
  const plan = planDePedido(soloSilobolsa);
  assert.equal(pedido(plan, 'camión'), undefined);
  assert.equal(pedido(plan, 'silobolsa').cantidad, Math.ceil(7000 / 190));
  assert.ok(pedido(plan, 'embolsadora').cantidad >= 1);
});

test('las fechas de pedido respetan el anticipo y la duración de la cosecha', () => {
  const plan = planDePedido(soloPuerto);
  const cosechadora = pedido(plan, 'cosechadora');
  const camion = pedido(plan, 'camión');
  assert.equal(cosechadora.pedir_antes_del, '2027-03-26');
  assert.equal(camion.pedir_antes_del, '2027-04-03');
  assert.equal(cosechadora.usar_desde, '2027-04-10');
  const dias = (new Date(cosechadora.usar_hasta) - new Date(cosechadora.usar_desde)) / 86400000 + 1;
  assert.equal(dias, dimensionarCosecha({ ...entrada, destino: 'puerto', distanciaKm: 300 }).cosechadoras.dias);
  assert.ok(cosechadora.pedir_antes_del < camion.pedir_antes_del);
});

test('una fecha inválida falla de forma explícita', () => {
  assert.throws(() => planDePedido({ ...entrada, fechaInicioCosecha: 'mañana' }), /fecha inválida/);
});

test('más hectáreas o menos días nunca piden menos maquinaria', () => {
  const base = planDePedido(soloPuerto);
  const apretado = planDePedido({ ...soloPuerto, diasDisponibles: 8 });
  const capacidad = (p) => pedido(p, 'cosechadora').cantidad;
  assert.ok(capacidad(apretado) >= capacidad(base));
});

test('por defecto solo se contrata la cosecha y no hacen falta destinos', () => {
  const { servicios, destinos, ...base } = entrada;
  const plan = planDePedido(base);
  assert.deepEqual(plan.servicios, ['cosecha']);
  assert.deepEqual(plan.recomendado.pedidos.map((p) => p.recurso), ['cosechadora', 'tractor con tolva']);
  assert.deepEqual(Object.keys(plan.recomendado.costos_por_servicio), ['cosecha']);
  assert.equal(plan.recomendado.destino, null);
});

test('cada pedido lleva su servicio y los costos por servicio suman los pedidos', () => {
  const plan = planDePedido(soloPuerto);
  const servicios = new Set(plan.recomendado.pedidos.map((p) => p.servicio));
  assert.deepEqual([...servicios].sort(), ['cosecha', 'transporte']);
  const suma = Object.values(plan.recomendado.costos_por_servicio).reduce((a, b) => a + b, 0);
  const total = plan.recomendado.pedidos.reduce((a, p) => a + p.costo_usd, 0);
  assert.ok(Math.abs(suma - total) < 1e-6);
  assert.equal(pedido(plan, 'camión').servicio, 'transporte');
});

test('almacenaje pide embolsadora y bolsas bajo ese servicio', () => {
  const plan = planDePedido(soloSilobolsa);
  assert.equal(pedido(plan, 'silobolsa').servicio, 'almacenaje');
  assert.ok(plan.recomendado.costo_extraccion_usd > 0);
});

test('un destino sin el servicio pedido se rechaza', () => {
  assert.throws(
    () => planDePedido({ ...soloPuerto, servicios: ['almacenaje'] }),
    /requiere pedir el servicio "transporte"/,
  );
  assert.throws(() => planDePedido({ ...soloPuerto, servicios: ['volar'] }), /servicio inválido: volar/);
});
