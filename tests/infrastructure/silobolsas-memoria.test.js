import assert from 'node:assert/strict';
import test from 'node:test';
import { crearContenedor } from '../../src/config/container.js';
import { crearLecturasMemoriaAdapter } from '../../src/infrastructure/iot/lecturasMemoriaAdapter.js';
import { crearSilobolsasMemoriaAdapter } from '../../src/infrastructure/silobolsas/silobolsasMemoriaAdapter.js';
import { DatoNoDisponible } from '../../src/domain/shared/errores.js';
import { barcos, lecturasSanas, precio, silobolsaSoja } from '../helpers/silobolsa.js';
import { tarifasSimuladas } from '../helpers/tarifas.js';

const entrada = { hoy: '2026-11-14', destino: { terminal: 'Puerto Gran Rosario', distanciaKm: 300 }, tasaAnual: 0.08 };
const armar = () => {
  const silobolsas = crearSilobolsasMemoriaAdapter([silobolsaSoja]);
  const lecturasIot = crearLecturasMemoriaAdapter({ 'SB-001': lecturasSanas });
  const contenedor = crearContenedor({
    tarifas: tarifasSimuladas, silobolsas, lecturasIot,
    precios: { precios: async () => precio },
    barcos: { calendario: async () => barcos },
  });
  return { silobolsas, lecturasIot, ...contenedor };
};

test('silobolsa registrado: decide la venta con sus lecturas', async () => {
  const { decidirVenta } = armar();
  const resultado = await decidirVenta({ ...entrada, silobolsaId: 'SB-001' });
  assert.equal(resultado.decision, 'embarcar');
});

test('silobolsa inexistente lanza DatoNoDisponible', async () => {
  const { decidirVenta } = armar();
  await assert.rejects(decidirVenta({ ...entrada, silobolsaId: 'NOPE' }), DatoNoDisponible);
});

test('silobolsa sin lecturas del IoT lanza DatoNoDisponible', async () => {
  const { decidirVenta, silobolsas } = armar();
  silobolsas.registrar({ ...silobolsaSoja, id: 'SB-002' });
  await assert.rejects(decidirVenta({ ...entrada, silobolsaId: 'SB-002' }), DatoNoDisponible);
});

test('las lecturas nuevas del IoT cambian el riesgo', async () => {
  const { lecturasIot, evaluarSilobolsa } = armar();
  const antes = await evaluarSilobolsa('SB-001');
  lecturasIot.agregar('SB-001', [{ timestamp: '2026-11-15T00:00:00Z', humedad: 17, temperatura: 38, co2: 10 }]);
  const despues = await evaluarSilobolsa('SB-001');
  assert.equal(antes.riesgo.nivel, 'bajo');
  assert.notEqual(despues.riesgo.nivel, 'bajo');
});
