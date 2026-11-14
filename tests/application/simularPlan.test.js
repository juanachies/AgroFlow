// Caso de uso central: simularPlan (plan + saturación del puerto + marketplace) y confirmarReservas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { crearMarketplaceMemoriaAdapter, simularReservasMercado } from '../../src/infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearBarcosSimuladosAdapter } from '../../src/infrastructure/barcos/barcosSimuladosAdapter.js';
import { tarifasSimuladas } from '../helpers/tarifas.js';

const HOY = '2027-03-20';
const entrada = {
  lote: { id: 'L1', lat: -33.95, lon: -60.6 },
  hoy: HOY,
  ha: 1200, qqHa: 38, cultivo: 'soja', diasDisponibles: 12, urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
  servicios: ['transporte', 'almacenaje'],
  destinos: [
    { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 300 },
    { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 35, costoAdicionalUsdPorT: 6, precioUsdPorT: 303 },
    { nombre: 'Puerto Gran Rosario', tipo: 'puerto', terminal: 'Puerto Gran Rosario', distanciaKm: 230, precioUsdPorT: 335 },
  ],
};

function armar({ picos = [] } = {}) {
  const marketplace = crearMarketplaceMemoriaAdapter({
    reservas: simularReservasMercado({ puerto: 'gran-rosario', desde: HOY, dias: 60, camionesBaseDia: 3800, picos }),
  });
  return { marketplace, ...crearContenedor({ tarifas: tarifasSimuladas, marketplace, barcos: crearBarcosSimuladosAdapter({ semilla: 7 }) }) };
}

test('con pico de saturación: el puerto sigue siendo el mejor destino, pero se corre el despacho de camiones', async () => {
  const { simularPlan } = armar({ picos: [{ fecha: '2027-04-14', camionesDia: 7200, ancho: 5 }] });
  const r = await simularPlan(entrada);
  assert.equal(r.plan.recomendado.tipo, 'puerto');
  assert.equal(r.puerto, 'gran-rosario');
  assert.ok(r.ventana.diasSaturadosOriginal > 0);
  assert.equal(r.ventana.diasSaturados, 0);
  const camion = r.plan.recomendado.pedidos.find((p) => p.recurso === 'camión');
  assert.equal(camion.usar_desde, r.ventana.inicio);
  const cosechadora = r.plan.recomendado.pedidos.find((p) => p.recurso === 'cosechadora');
  assert.equal(cosechadora.usar_desde, '2027-04-10'); // la cosecha no se mueve
  assert.ok(r.avisos.some((a) => a.tipo === 'ventana-despacho' && a.nivel === 'alerta'));
  assert.equal(r.asignacion.completa, true);
});

test('sin pico: no mueve nada e informa que el puerto está fluido en el despacho', async () => {
  const { simularPlan } = armar();
  const r = await simularPlan(entrada);
  assert.equal(r.ventana.desplazamientoDias, 0);
  assert.ok(r.avisos.some((a) => a.tipo === 'ventana-despacho' && a.nivel === 'info'));
});

test('confirmar: crea reservas y los camiones del productor cuentan en el pronóstico de los demás', async () => {
  const { simularPlan, confirmarReservas, marketplace } = armar();
  const r = await simularPlan(entrada);
  const antes = r.saturacion.dias.find((d) => d.fecha === '2027-04-12').camionesEsperados;
  const reservas = await confirmarReservas({ simulacion: r, loteId: 'L1' });
  assert.ok(reservas.length >= 3);
  const camiones = reservas.filter((x) => x.recurso === 'camión');
  assert.ok(camiones.every((x) => x.puerto === 'gran-rosario' && x.capacidadT > 0));
  // Otro productor simula después: ve más camiones esperados esos días.
  const otro = await simularPlan({ ...entrada, lote: { id: 'L2', lat: -34.2, lon: -60.7 } });
  const despues = otro.saturacion.dias.find((d) => d.fecha === '2027-04-12').camionesEsperados;
  assert.ok(despues > antes);
  // Y el marketplace ya no ofrece las mismas unidades esos días.
  const usadas = new Set(reservas.map((x) => x.ofertaId));
  const repetidas = otro.asignacion.lineas.flatMap((l) => l.asignaciones).filter((a) => usadas.has(a.ofertaId));
  for (const a of repetidas) assert.ok(a.unidades > 0);
  await assert.rejects(confirmarReservas({ simulacion: r, loteId: 'L1' }), /ya existe/);
  await assert.rejects(confirmarReservas({ simulacion: {} }), /simularPlan/);
});

test('sin destino puerto no calcula saturación y el marketplace igual arma la propuesta', async () => {
  const { simularPlan } = armar();
  const r = await simularPlan({ ...entrada, servicios: ['almacenaje'], destinos: [entrada.destinos[0]] });
  assert.equal(r.saturacion, null);
  assert.equal(r.plan.recomendado.tipo, 'silobolsa');
  assert.ok(r.asignacion.lineas.some((l) => l.linea.recurso === 'embolsadora'));
});

test('faltan proveedores: aviso crítico con sugerencia', async () => {
  const marketplace = crearMarketplaceMemoriaAdapter({ ofertas: [] });
  const { simularPlan } = crearContenedor({ tarifas: tarifasSimuladas, marketplace, barcos: crearBarcosSimuladosAdapter({ semilla: 7 }) });
  const r = await simularPlan(entrada);
  assert.equal(r.asignacion.completa, false);
  assert.ok(r.avisos.some((a) => a.tipo === 'faltante' && a.nivel === 'critico'));
});
