// API HTTP: levanta el servidor en un puerto libre y la prueba con fetch.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { crearServidor, armarContenedor } from '../../src/interfaces/http/server.js';
import { ENTRADA_EJEMPLO } from '../../src/interfaces/http/app.js';

let servidor;
let base;

before(async () => {
  servidor = crearServidor({ contenedor: armarContenedor({ explicador: null }), origenCors: 'https://front.example', conFront: false });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => new Promise((ok) => servidor.close(ok)));

const json = (ruta, cuerpo) => fetch(`${base}${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('salud y ejemplo, con CORS', async () => {
  const r = await fetch(`${base}/api/salud`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://front.example');
  assert.equal((await r.json()).ok, true);
  const ejemplo = await (await fetch(`${base}/api/ejemplo`)).json();
  assert.equal(ejemplo.cultivo, 'soja');
  const pre = await fetch(`${base}/api/simular`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /PATCH/);
  assert.match(pre.headers.get('access-control-allow-headers'), /authorization/i);
  const accountRoute = await fetch(`${base}/api/service-offerings`);
  assert.equal(accountRoute.status, 401);
  assert.equal(accountRoute.headers.get('access-control-allow-origin'), 'https://front.example');
  const missingRoute = await fetch(`${base}/api/does-not-exist`);
  assert.equal(missingRoute.headers.get('access-control-allow-origin'), 'https://front.example');
});

test('simular, confirmar y ver la reserva en la saturación', async () => {
  const r = await json('/api/simular', ENTRADA_EJEMPLO);
  assert.equal(r.status, 200);
  const sim = await r.json();
  assert.ok(sim.simulacionId);
  assert.equal(sim.plan.recomendado.tipo, 'puerto');
  assert.ok(sim.saturacion.dias.length > 0);
  assert.equal(sim.ventana.diasSaturados, 0);
  assert.equal(sim.asignacion.completa, true);

  const antes = await (await fetch(`${base}/api/saturacion?puerto=gran-rosario&cultivo=soja&hoy=2027-03-20`)).json();
  const conf = await json('/api/reservas', { simulacionId: sim.simulacionId });
  assert.equal(conf.status, 201);
  const { reservas } = await conf.json();
  assert.ok(reservas.length > 0);
  const camion = reservas.find((x) => x.recurso === 'camión');
  const dia = camion.desde;
  const despues = await (await fetch(`${base}/api/saturacion?puerto=gran-rosario&cultivo=soja&hoy=2027-03-20`)).json();
  const camionesAntes = antes.dias.find((d) => d.fecha === dia).camionesEsperados;
  const camionesDespues = despues.dias.find((d) => d.fecha === dia).camionesEsperados;
  assert.ok(camionesDespues > camionesAntes);

  // La simulación se consume al confirmar.
  const otra = await json('/api/reservas', { simulacionId: sim.simulacionId });
  assert.equal(otra.status, 404);
  const listado = await (await fetch(`${base}/api/reservas?puerto=gran-rosario&desde=${dia}&hasta=${dia}`)).json();
  assert.ok(listado.reservas.some((x) => x.loteId === 'lote-pergamino'));
});

test('ofertas: listar y dar de alta un proveedor', async () => {
  const lista = await (await fetch(`${base}/api/ofertas?recurso=embolsadora`)).json();
  assert.ok(lista.ofertas.length > 0 && lista.ofertas.every((o) => o.recurso === 'embolsadora'));
  const alta = await json('/api/ofertas', {
    proveedor: 'Transportes Test', recurso: 'camión', tipo: 'camion-bitren', unidades: 5,
    base: { lat: -33.9, lon: -60.6, localidad: 'Pergamino' }, radioKm: 120,
    disponibleDesde: '2027-03-01', disponibleHasta: '2027-06-30', precioRelativo: 0.9,
  });
  assert.equal(alta.status, 201);
  const { oferta } = await alta.json();
  assert.ok(oferta.id.startsWith('of-'));
  const mala = await json('/api/ofertas', { proveedor: 'X', recurso: 'avión' });
  assert.equal(mala.status, 400);
});

test('errores: validación, JSON inválido, rutas y métodos', async () => {
  const sinDatos = await json('/api/simular', { cultivo: 'soja' });
  assert.equal(sinDatos.status, 400);
  assert.match((await sinDatos.json()).error, /faltan datos/);
  const fechaMala = await json('/api/simular', { ...ENTRADA_EJEMPLO, hoy: '20-03-2027' });
  assert.equal(fechaMala.status, 400);
  const noJson = await fetch(`${base}/api/simular`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{roto' });
  assert.equal(noJson.status, 400);
  const sinTipo = await fetch(`${base}/api/simular`, { method: 'POST', body: '{}' });
  assert.equal(sinTipo.status, 415);
  assert.equal((await fetch(`${base}/api/saturacion`)).status, 400);
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
  assert.equal((await fetch(`${base}/api/simular`)).status, 405);
  assert.equal((await json('/api/reservas', {})).status, 400);
  assert.equal((await fetch(`${base}/no-existe.html`)).status, 404);
});

test('IA: explicar una simulación y simular un escenario', async () => {
  const sim = await (await json('/api/simular', ENTRADA_EJEMPLO)).json();
  const exp = await json('/api/explicar', { simulacionId: sim.simulacionId });
  assert.equal(exp.status, 200);
  const e = await exp.json();
  assert.equal(e.fuente, 'plantilla');
  assert.match(e.texto, /Puerto Gran Rosario/);
  const tipos = (await (await fetch(`${base}/api/escenarios`)).json()).escenarios.map((x) => x.tipo);
  assert.ok(tipos.includes('lluvia') && tipos.includes('saturacion'));
  const esc = await json('/api/escenario', { simulacionId: sim.simulacionId, escenario: { tipo: 'lluvia', valor: 5 } });
  assert.equal(esc.status, 200);
  const r = await esc.json();
  assert.ok(r.simulacionId && r.simulacionId !== sim.simulacionId); // el escenario también se puede confirmar
  assert.match(r.explicacion.texto, /^Si llueve 5 días más/);
  assert.equal((await json('/api/escenario', { simulacionId: sim.simulacionId, escenario: { tipo: 'x', valor: 1 } })).status, 400);
  assert.equal((await json('/api/explicar', { simulacionId: 'no-existe' })).status, 404);
});

test('silobolsas: registrar, cargar lecturas, ver riesgo y decidir la venta', async () => {
  const alta = await json('/api/silobolsas', { id: 'SB-API', cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' });
  assert.equal(alta.status, 201);
  const lecturas = [10, 11, 12, 13, 14].map((d, i) => ({ timestamp: `2026-11-${d}T00:00:00Z`, humedad: 14 + i * 0.25, temperatura: 24, co2: 3 }));
  assert.equal((await json('/api/silobolsas/SB-API/lecturas', { lecturas })).status, 201);
  const riesgo = await (await fetch(`${base}/api/silobolsas/SB-API/riesgo`)).json();
  assert.equal(riesgo.silobolsa.id, 'SB-API');
  assert.ok(['bajo', 'medio', 'alto'].includes(riesgo.riesgo.nivel));
  const venta = await json('/api/silobolsas/SB-API/venta', { hoy: '2026-11-14', destino: { terminal: 'Puerto Gran Rosario', distanciaKm: 300, acopios: [{ nombre: 'Coop', distanciaKm: 25 }] } });
  assert.equal(venta.status, 200);
  assert.ok((await venta.json()).decision);
  const lista = await (await fetch(`${base}/api/silobolsas`)).json();
  assert.ok(lista.silobolsas.some((s) => s.id === 'SB-API'));
  // Errores
  assert.equal((await fetch(`${base}/api/silobolsas/NO/riesgo`)).status, 404);
  assert.equal((await json('/api/silobolsas', { cultivo: 'arroz', kg: 1, fechaCreacion: '2026-04-20' })).status, 400);
  assert.equal((await json('/api/silobolsas/SB-API/lecturas', { lecturas: [{ timestamp: 'ayer' }] })).status, 400);
  assert.equal((await json('/api/silobolsas/SB-API/venta', { hoy: '2026-11-14', destino: {} })).status, 400);
  assert.equal((await fetch(`${base}/api/silobolsas/SB-API/venta`)).status, 405);
});

test('venta en cosecha según barcos', async () => {
  const r = await json('/api/venta-cosecha', { puerto: 'gran-rosario', cultivo: 'soja', hoy: '2027-03-20', fechaGranoListo: '2027-04-10', toneladas: 1200, distanciaPuertoKm: 230, distanciaAcopioKm: 35 });
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.ok(['vender', 'silobolsa'].includes(v.venta.decision));
  assert.ok(v.cadetes);
});
