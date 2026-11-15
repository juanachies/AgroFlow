import test from 'node:test';
import assert from 'node:assert/strict';

import { pronosticoDesdeClima } from '../../src/interfaces/web/lib/climaAutomatico.js';

const lote = { latitude: -33.9, longitude: -60.6 };
const AHORA = new Date('2026-11-15T12:00:00Z');

test('arma el pronóstico solo con los días pronosticados, no con la climatología', () => {
  const respuesta = {
    dias: [
      { fecha: '2026-11-15', fuente: 'pronostico', lluviaMm: 0, tempMaxC: 28, tempMinC: 15 },
      { fecha: '2026-11-16', fuente: 'pronostico', lluviaMm: 12, tempMaxC: 24, tempMinC: null },
      { fecha: '2026-12-20', fuente: 'climatologia', lluviaMm: 3.9 },
    ],
  };
  const pronostico = pronosticoDesdeClima(respuesta, lote, AHORA);

  assert.deepEqual(pronostico.dailyForecast, [
    { date: '2026-11-15', precipitationMm: 0, temperatureMaxC: 28, temperatureMinC: 15 },
    { date: '2026-11-16', precipitationMm: 12, temperatureMaxC: 24, temperatureMinC: null },
  ]);
  assert.equal(pronostico.queriedAt, '2026-11-15T12:00:00.000Z');
  assert.deepEqual(pronostico.lote, lote);
  assert.deepEqual(pronostico.sourceStatus.successful, ['Open-Meteo']);
});

test('sin días pronosticados no inventa datos', () => {
  assert.equal(pronosticoDesdeClima({ dias: [{ fecha: '2026-12-20', fuente: 'climatologia', lluviaMm: 3 }] }, lote, AHORA), null);
  assert.equal(pronosticoDesdeClima(undefined, lote, AHORA), null);
});
