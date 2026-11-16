import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VARIABLES_CLIMA,
  colorPara,
  consultarClimaLotes,
  formatearValor,
  ventanaHoraria,
} from '../../src/interfaces/web/lib/climaTiempoReal.js';

const LOTE = { id: 'lote-1', latitude: -33.9, longitude: -60.6 };

function horasDesde(inicio, cantidad) {
  const base = Date.parse(inicio);
  return Array.from({ length: cantidad }, (_, i) => new Date(base + i * 3600000).toISOString().slice(0, 16));
}

function respuestaCruda({ temperatura = 20, humedadAire = 60 } = {}) {
  const horas = horasDesde('2026-11-14T12:00:00Z', 48);
  const precipitacion = horas.map((_, i) => (i >= 1 && i <= 24 ? 1 : 0));
  const llenar = (valor) => horas.map(() => valor);
  return {
    latitude: LOTE.latitude,
    longitude: LOTE.longitude,
    current: {
      time: horas[24],
      temperature_2m: temperatura,
      relative_humidity_2m: humedadAire,
      precipitation: 2.5,
      wind_speed_10m: 18,
      wind_gusts_10m: 32,
    },
    hourly: {
      time: horas,
      temperature_2m: llenar(temperatura),
      relative_humidity_2m: llenar(humedadAire),
      precipitation: precipitacion,
      precipitation_probability: llenar(40),
      wind_speed_10m: llenar(18),
      wind_gusts_10m: llenar(32),
      soil_moisture_0_to_1cm: llenar(0.3),
      soil_moisture_3_to_9cm: llenar(0.27),
    },
  };
}

const fetchCon = (cuerpo, captura) => async (url) => {
  if (captura) captura.url = url;
  return { ok: true, json: async () => cuerpo };
};

test('normaliza la respuesta de una sola coordenada', async () => {
  const resultado = await consultarClimaLotes([LOTE], { fetchImpl: fetchCon(respuestaCruda()) });

  assert.equal(resultado.lotes.length, 1);
  const [lote] = resultado.lotes;
  assert.equal(lote.loteId, 'lote-1');
  assert.deepEqual(lote.actual, {
    precipitacion: 2.5,
    humedadAire: 60,
    humedadSuelo: 0.3,
    temperatura: 20,
    viento: 18,
    rafagas: 32,
    hora: '2026-11-15T12:00',
  });
  assert.equal(lote.serieHoraria.length, 48);
  assert.deepEqual(lote.serieHoraria[0], {
    hora: '2026-11-14T12:00',
    precipitacion: 0,
    humedadAire: 60,
    humedadSuelo: 0.3,
    humedadSueloProfundo: 0.27,
    temperatura: 20,
    viento: 18,
    rafagas: 32,
    probabilidadLluvia: 40,
  });
});

test('normaliza un arreglo de coordenadas y respeta el orden de los lotes', async () => {
  const otro = { id: 'lote-2', latitude: -34.5, longitude: -61.2 };
  const captura = {};
  const resultado = await consultarClimaLotes(
    [LOTE, otro],
    { fetchImpl: fetchCon([respuestaCruda({ temperatura: 21 }), respuestaCruda({ temperatura: 25 })], captura) },
  );

  assert.deepEqual(resultado.lotes.map(({ loteId }) => loteId), ['lote-1', 'lote-2']);
  assert.equal(resultado.lotes[0].actual.temperatura, 21);
  assert.equal(resultado.lotes[1].actual.temperatura, 25);
});

test('arma la URL con todas las coordenadas y los parámetros pedidos', async () => {
  const captura = {};
  const sinCoordenadas = { id: 'lote-3' };

  await consultarClimaLotes(
    [LOTE, { id: 'lote-2', latitude: -34.5, longitude: -61.2 }, sinCoordenadas],
    { fetchImpl: fetchCon([respuestaCruda(), respuestaCruda()], captura) },
  );

  const url = new URL(captura.url);
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '-33.9,-34.5');
  assert.equal(url.searchParams.get('longitude'), '-60.6,-61.2');
  assert.equal(url.searchParams.get('current'), 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m');
  assert.equal(
    url.searchParams.get('hourly'),
    'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,precipitation_probability',
  );
  assert.equal(url.searchParams.get('past_days'), '1');
  assert.equal(url.searchParams.get('forecast_days'), '3');
  assert.equal(url.searchParams.get('timezone'), 'America/Argentina/Buenos_Aires');
});

test('acumula la lluvia de las últimas 24 horas', async () => {
  const resultado = await consultarClimaLotes([LOTE], { fetchImpl: fetchCon(respuestaCruda()) });

  assert.equal(resultado.lotes[0].acumulado24hMm, 24);
});

test('formatearValor usa es-AR y no muestra más de un decimal', () => {
  assert.equal(formatearValor('precipitacion', 12.345), '12,3 mm');
  assert.equal(formatearValor('humedadSuelo', 0.234), '23,4 %');
  assert.equal(formatearValor('temperatura', -2.06), '-2,1 °C');
  assert.equal(formatearValor('viento', 17), '17 km/h');
  assert.equal(formatearValor('humedadAire', null), '—');
  assert.match(formatearValor('precipitacion', 1.23456), /^-?\d+(,\d)? mm$/);
});

test('colorPara elige el tramo de la escala y tolera valores faltantes', () => {
  assert.equal(colorPara('precipitacion', 0), '#94a3b8');
  assert.equal(colorPara('precipitacion', 25), '#dc2626');
  assert.equal(colorPara('humedadSuelo', 0.45), '#0284c7');
  assert.equal(colorPara('temperatura', null), '#3b82f6');
  assert.equal(VARIABLES_CLIMA.length, 5);
});

test('serieHoraria trae las claves que grafica ClimaPage', async () => {
  const resultado = await consultarClimaLotes([LOTE], { fetchImpl: fetchCon(respuestaCruda()) });
  const [punto] = resultado.lotes[0].serieHoraria;

  for (const clave of ['hora', 'precipitacion', 'humedadAire', 'humedadSuelo', 'temperatura', 'viento']) {
    assert.ok(Object.hasOwn(punto, clave), `falta la clave ${clave}`);
  }
  for (const { id } of VARIABLES_CLIMA) {
    assert.ok(Object.hasOwn(punto, id), `falta la variable ${id}`);
  }
});

test('la ventana horaria ubica ahora aunque current.time traiga minutos', async () => {
  const resultado = await consultarClimaLotes([LOTE], { fetchImpl: fetchCon(respuestaCruda()) });
  const lote = resultado.lotes[0];
  const resumen = { serieHoraria: lote.serieHoraria, actual: { ...lote.actual, hora: '2026-11-15T12:30' } };

  const { puntos, indiceAhora } = ventanaHoraria(resumen);

  assert.equal(puntos.length, 47);
  assert.equal(indiceAhora, 23);
  assert.equal(puntos[indiceAhora].hora, '2026-11-15T12:00');
});

test('un error HTTP lanza un mensaje claro', async () => {
  await assert.rejects(
    consultarClimaLotes([LOTE], { fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /Open-Meteo respondió con error HTTP 503\./,
  );
});
