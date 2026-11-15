import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from '../../src/interfaces/web/lib/api.js';

function mockFetch(captura) {
  globalThis.fetch = async (url, opciones = {}) => {
    captura.url = url;
    captura.method = opciones.method ?? 'GET';
    captura.body = opciones.body ? JSON.parse(opciones.body) : undefined;
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    };
  };
}

test('silobolsas consulta el listado', async (t) => {
  const captura = {};
  const original = globalThis.fetch;
  mockFetch(captura);
  t.after(() => { globalThis.fetch = original; });

  await api.silobolsas();

  assert.equal(captura.url, '/api/silobolsas');
  assert.equal(captura.method, 'GET');
});

test('registrarSilobolsa envía el alta', async (t) => {
  const captura = {};
  const original = globalThis.fetch;
  mockFetch(captura);
  t.after(() => { globalThis.fetch = original; });

  const datos = { cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' };
  await api.registrarSilobolsa(datos);

  assert.equal(captura.url, '/api/silobolsas');
  assert.equal(captura.method, 'POST');
  assert.deepEqual(captura.body, datos);
});

test('cargarLecturas apunta a la bolsa', async (t) => {
  const captura = {};
  const original = globalThis.fetch;
  mockFetch(captura);
  t.after(() => { globalThis.fetch = original; });

  const lecturas = [{ timestamp: '2026-11-14T00:00:00Z', humedad: 14.2, temperatura: 24, co2: 3 }];
  await api.cargarLecturas('SB-01', lecturas);

  assert.equal(captura.url, '/api/silobolsas/SB-01/lecturas');
  assert.equal(captura.method, 'POST');
  assert.deepEqual(captura.body, { lecturas });
});

test('riesgoSilobolsa consulta el riesgo', async (t) => {
  const captura = {};
  const original = globalThis.fetch;
  mockFetch(captura);
  t.after(() => { globalThis.fetch = original; });

  await api.riesgoSilobolsa('SB-01');

  assert.equal(captura.url, '/api/silobolsas/SB-01/riesgo');
  assert.equal(captura.method, 'GET');
});

test('venderSilobolsa envía la decisión de venta', async (t) => {
  const captura = {};
  const original = globalThis.fetch;
  mockFetch(captura);
  t.after(() => { globalThis.fetch = original; });

  const datos = { hoy: '2026-11-14', destino: { terminal: 'Puerto Gran Rosario', distanciaKm: 300 }, tasaAnual: 0.08 };
  await api.venderSilobolsa('SB-01', datos);

  assert.equal(captura.url, '/api/silobolsas/SB-01/venta');
  assert.equal(captura.method, 'POST');
  assert.deepEqual(captura.body, datos);
});
