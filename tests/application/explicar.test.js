// IA: resumen, plantilla, adaptador de OpenAI (con fetch falso), respaldo y escenarios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { crearMarketplaceMemoriaAdapter, simularReservasMercado } from '../../src/infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearBarcosSimuladosAdapter } from '../../src/infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearOpenAIAdapter } from '../../src/infrastructure/ia/openaiAdapter.js';
import { resumirSimulacion, compararSimulaciones } from '../../src/domain/ia/resumen.js';
import { diasHabilesConLluvia } from '../../src/domain/clima/ajusteLluvia.js';
import { ENTRADA_EJEMPLO } from '../../src/interfaces/http/app.js';
import { tarifasSimuladas } from '../helpers/tarifas.js';

function armar(extra = {}) {
  const marketplace = crearMarketplaceMemoriaAdapter({
    reservas: simularReservasMercado({ puerto: 'gran-rosario', desde: '2027-03-01', dias: 90, camionesBaseDia: 3800, picos: [{ fecha: '2027-04-14', camionesDia: 7200, ancho: 5 }] }),
  });
  return crearContenedor({ tarifas: tarifasSimuladas, marketplace, barcos: crearBarcosSimuladosAdapter({ semilla: 7 }), explicador: null, ...extra });
}

const respuesta = (status, cuerpo, headers = {}) => ({ ok: status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => cuerpo });

test('resumen: solo los números del motor, con destino, saturación, despacho, pedido y marketplace', async () => {
  const r = await armar().simularPlan(ENTRADA_EJEMPLO);
  const s = resumirSimulacion(r);
  assert.equal(s.destino.recomendado, 'Puerto Gran Rosario');
  assert.equal(s.puerto.diasSaturados, 5);
  assert.equal(s.despacho.diasSaturadosEvitados, 5);
  assert.ok(s.pedido.some((p) => p.recurso === 'camión'));
  assert.equal(s.marketplace.coberturaPct, 100);
  assert.ok(s.marketplace.proveedores > 0);
});

test('explicación de respaldo (plantilla) cuando no hay IA', async () => {
  const c = armar();
  const e = await c.explicarRecomendacion({ resultado: await c.simularPlan(ENTRADA_EJEMPLO) });
  assert.equal(e.fuente, 'plantilla');
  assert.match(e.texto, /Puerto Gran Rosario/);
  assert.match(e.texto, /despachar entre el 2027-04-20 y el 2027-04-27/);
  assert.match(e.texto, /marketplace cubre el 100%/);
});

test('OpenAI: responde, reintenta ante 429 respetando Retry-After y no reintenta un 400', async () => {
  const esperas = [];
  let llamadas = 0;
  const fetchImpl = async (url, opciones) => {
    llamadas++;
    assert.match(url, /chat\/completions$/);
    const cuerpo = JSON.parse(opciones.body);
    assert.equal(cuerpo.model, 'modelo-test');
    assert.match(cuerpo.messages[1].content, /Datos \(JSON\)/);
    if (llamadas === 1) return respuesta(429, {}, { 'retry-after': '2' });
    return respuesta(200, { model: 'modelo-test', choices: [{ message: { content: ' Mandalo al puerto. ' } }] });
  };
  const ia = crearOpenAIAdapter({ apiKey: 'k', modelo: 'modelo-test', fetchImpl, esperar: async (ms) => esperas.push(ms) });
  const r = await ia.explicar({ resumen: { destino: {} } });
  assert.deepEqual(r, { texto: 'Mandalo al puerto.', fuente: 'openai', modelo: 'modelo-test' });
  assert.deepEqual(esperas, [2000]);

  let llamadas400 = 0;
  const ia400 = crearOpenAIAdapter({ apiKey: 'k', fetchImpl: async () => { llamadas400++; return respuesta(400, {}); }, esperar: async () => {} });
  await assert.rejects(ia400.explicar({ resumen: {} }), /400/);
  assert.equal(llamadas400, 1);
  assert.throws(() => crearOpenAIAdapter({}), /OPENAI_API_KEY/);
});

test('si la IA falla, el caso de uso cae a la plantilla y lo avisa', async () => {
  const caida = crearOpenAIAdapter({ apiKey: 'k', reintentos: 1, fetchImpl: async () => respuesta(503, {}), esperar: async () => {} });
  const c = armar({ explicador: caida });
  const e = await c.explicarRecomendacion({ resultado: await c.simularPlan(ENTRADA_EJEMPLO) });
  assert.equal(e.fuente, 'plantilla');
  assert.match(e.aviso, /la IA no respondió/);
});

test('escenarios: lluvia, precio del puerto e inválidos', async () => {
  const c = armar();
  const base = await c.simularPlan(ENTRADA_EJEMPLO);
  const lluvia = await c.simularEscenario({ entrada: ENTRADA_EJEMPLO, base, escenario: { tipo: 'lluvia', valor: 6 } });
  assert.equal(lluvia.escenario.descripcion, 'llueve 6 días más durante la cosecha');
  const cosechadoras = (r) => r.plan.recomendado.pedidos.find((p) => p.recurso === 'cosechadora').cantidad;
  assert.ok(cosechadoras(lluvia.resultado) > cosechadoras(base));
  assert.ok(lluvia.explicacion.comparacion.cambios.some((x) => x.startsWith('cosechadora')));
  assert.match(lluvia.explicacion.texto, /^Si llueve 6 días más/);

  const precio = await c.simularEscenario({ entrada: ENTRADA_EJEMPLO, base, escenario: { tipo: 'precioPuerto', valor: -60 } });
  assert.notEqual(precio.resultado.plan.recomendado.tipo, 'puerto');
  assert.ok(precio.explicacion.comparacion.cambios.some((x) => x.includes('destino recomendado pasa de Puerto Gran Rosario')));

  const comparacionIgual = compararSimulaciones(base, base);
  assert.deepEqual(comparacionIgual.cambios, []);
  await assert.rejects(c.simularEscenario({ entrada: ENTRADA_EJEMPLO, base, escenario: { tipo: 'meteorito', valor: 1 } }), /escenario inválido/);
  await assert.rejects(c.simularEscenario({ entrada: ENTRADA_EJEMPLO, base, escenario: { tipo: 'lluvia', valor: 'mucho' } }), /valor numérico/);
});

test('clima: descuenta días de lluvia del pronóstico; rutas: OSRM o línea recta × 1,3', async () => {
  assert.deepEqual(
    diasHabilesConLluvia({ diasDisponibles: 4, desde: '2027-04-10', pronostico: [{ fecha: '2027-04-10', lluviaMm: 12 }, { fecha: '2027-04-11', lluviaMm: 1 }, { fecha: '2027-04-13', lluviaMm: 6 }, { fecha: '2027-04-20', lluviaMm: 30 }] }).diasLluviosos,
    ['2027-04-10', '2027-04-13'],
  );
  const clima = { obtenerPronostico: async ({ startDate }) => ({ daily: { time: [startDate, '2027-04-11', '2027-04-12'], precipitation_sum: [15, 0, 8] } }) };
  const rutas = { distanciaKm: async () => ({ distanceKm: 251.4, source: 'OpenStreetMap OSRM' }) };
  const sinKm = { ...ENTRADA_EJEMPLO, destinos: ENTRADA_EJEMPLO.destinos.map(({ distanciaKm, ...d }) => d) };
  const r = await armar({ fuentesExternas: true, fuentes: { openMeteo: clima, rutas } }).simularPlan(sinKm);
  assert.equal(r.clima.diasConLluvia, 2);
  assert.equal(r.entrada.diasDisponibles, ENTRADA_EJEMPLO.diasDisponibles - 2);
  assert.ok(r.avisos.some((a) => a.tipo === 'clima'));
  assert.deepEqual(r.distancias.map((d) => d.fuente), ['OpenStreetMap OSRM', 'OpenStreetMap OSRM']);

  // Sin red: el pronóstico falla y la ruta cae a línea recta.
  const caido = { obtenerPronostico: async () => { throw new Error('sin red'); } };
  const rutaCaida = { distanciaKm: async () => { throw new Error('sin red'); } };
  const r2 = await armar({ fuentesExternas: true, fuentes: { openMeteo: caido, rutas: rutaCaida } }).simularPlan(sinKm);
  assert.equal(r2.clima.disponible, false);
  assert.ok(r2.distancias.every((d) => d.fuente === 'línea recta × 1,3'));
  const puerto = r2.entrada.destinos.find((d) => d.tipo === 'puerto');
  assert.ok(puerto.distanciaKm > 100 && puerto.distanciaKm < 200); // Pergamino → Gran Rosario ≈ 115 km recta × 1,3
});

test('plantilla: plurales y plazo de pedido vencido', async () => {
  const c = armar();
  const r = await c.simularPlan({ ...ENTRADA_EJEMPLO, hoy: '2027-04-05' });
  const e = await c.explicarRecomendacion({ resultado: r });
  assert.match(e.texto, /\d+ cosechadoras/);
  assert.match(e.texto, /\d+ camiones/);
  assert.match(e.texto, /ya pasó el anticipo recomendado/);
});
