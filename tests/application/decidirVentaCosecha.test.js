// Caso de uso decidirVentaCosecha: composición Barcos -> Venta -> Cadetes y uso de puertos con adaptadores simulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarVentaCosecha, crearDecidirVentaCosecha } from '../../src/application/usecases/decidirVentaCosecha.js';
import { crearBarcosSimuladosAdapter, simularLineup } from '../../src/infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearNivelRioManualAdapter } from '../../src/infrastructure/rio/nivelRioManualAdapter.js';

const HOY = '2027-04-22';

test('flujo completo: Barcos -> Venta -> Cadetes', () => {
  const lineup = simularLineup({ hoy: HOY, semilla: 3 });
  const r = planificarVentaCosecha({ lineup, puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: '2027-04-26', toneladas: 1200, distanciaPuertoKm: 300, distanciaAcopioKm: 25 });
  assert.ok(r.barcos.senal.length > 0);
  assert.ok(['vender', 'silobolsa'].includes(r.venta.decision));
  assert.equal(r.cadetes.destino, r.venta.decision === 'silobolsa' ? 'silobolsa' : r.venta.canal);
  assert.ok(r.avisos.some((a) => a.tipo === 'decision-venta'));
  assert.ok(r.avisos.some((a) => a.tipo === 'pedir-cadetes'));
  if (r.venta.canal !== 'puerto') assert.ok(!r.avisos.some((a) => a.tipo === 'poca-disponibilidad' || a.tipo === 'perder-barco'));
});

test('flujo con futuro alto termina en silobolsa y embolsadora', () => {
  const r = planificarVentaCosecha({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: '2027-04-26', toneladas: 1200, distanciaPuertoKm: 300, precios: { futuroUSDt: 380 } });
  assert.equal(r.venta.decision, 'silobolsa');
  assert.equal(r.cadetes.destino, 'silobolsa');
  assert.ok(r.cadetes.embolsadoras >= 1);
});


test('caso de uso con puertos: usa el respaldo si el adaptador de barcos falla y toma el nivel del río', async () => {
  const roto = { origen: 'roto', calendario: async () => { throw new Error('sin red'); } };
  const decidir = crearDecidirVentaCosecha({ barcos: roto, respaldoBarcos: crearBarcosSimuladosAdapter({ semilla: 3 }), nivelRio: crearNivelRioManualAdapter(1.2) });
  const r = await decidir({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: HOY, toneladas: 1000, distanciaPuertoKm: 300, distanciaAcopioKm: 40 });
  assert.match(r.fuentes.barcos, /respaldo/);
  assert.equal(r.fuentes.nivelParana, 'NivelRioPort');
  assert.ok(r.venta.indicesPuerto.checks.find((c) => c.id === 'nivelParana').estado === 'rojo');
  await assert.rejects(crearDecidirVentaCosecha({ barcos: roto })({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: HOY, toneladas: 1, distanciaPuertoKm: 1 }), /sin red/);
});

test('con PreciosPort: usa el spot real y evalúa la silobolsa mes a mes; si falla, vuelve a los supuestos', async () => {
  const precios = { origen: 'test', precios: async () => ({ spot: 280, futuros: [{ mes: '2027-05', precio: 330 }], fuente: 'test' }) };
  const r = await crearDecidirVentaCosecha({ barcos: crearBarcosSimuladosAdapter({ semilla: 3 }), precios })({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: HOY, toneladas: 1000, distanciaPuertoKm: 300 });
  assert.equal(r.fuentes.precios, 'test');
  assert.equal(r.venta.silobolsa.detalle.alternativas.length, 6);
  const roto = { precios: async () => { throw new Error('caído'); } };
  const r2 = await crearDecidirVentaCosecha({ barcos: crearBarcosSimuladosAdapter({ semilla: 3 }), precios: roto })({ puerto: 'gran-rosario', cultivo: 'soja', hoy: HOY, fechaGranoListo: HOY, toneladas: 10, distanciaPuertoKm: 10 });
  assert.match(r2.fuentes.precios, /falló/);
});
