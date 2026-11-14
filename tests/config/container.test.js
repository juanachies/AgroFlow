import test from 'node:test';
import assert from 'node:assert/strict';
import { container } from '../../src/config/container.js';
import * as api from '../../src/index.js';

test('el contenedor comparte adaptadores de fuentes y casos de uso de cosecha/venta', () => {
  assert.equal(container.services.clima, container.services.openMeteo);
  assert.equal(typeof container.usecases.consultarCondicionesCosecha, 'function');
  assert.equal(typeof container.usecases.decidirVentaCosecha, 'function');
  assert.equal(typeof container.decidirVentaCosecha, 'function');
  assert.equal(typeof container.planificarCosecha, 'function');
  assert.equal(typeof api.crearDecidirVentaCosecha, 'function');
  assert.equal(typeof api.dimensionarCosecha, 'function');
  assert.equal(typeof api.evaluarRiesgo, 'function');
});

test('el caso de uso de clima permite inyectar Open-Meteo y devuelve el pronóstico', async () => {
  const resultado = await container.usecases.consultarCondicionesCosecha({
    lote: { latitude: -32.95, longitude: -60.64 },
    adapters: {
      openMeteo: {
        obtenerPronostico: async () => ({
          timezone: 'America/Argentina/Buenos_Aires',
          daily: { time: ['2026-11-14'], precipitation_sum: [4] },
          hourly: { time: [] },
        }),
      },
    },
  });

  assert.equal(resultado.dailyForecast[0].date, '2026-11-14');
  assert.equal(resultado.dailyForecast[0].precipitationMm, 4);
});
