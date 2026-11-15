import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calificarHumedadGrano,
  calificarViento,
  costoDeSecado,
  estimarHumedadGrano,
  humedadDeEquilibrio,
  riesgoSilobolsaPorHumedad,
} from '../../src/domain/cosecha/condicionesCosecha.js';
import { resumirClimatologia } from '../../src/domain/clima/climatologia.js';
import { combinarPronostico } from '../../src/domain/clima/pronosticoCosecha.js';
import { armarEstrategia } from '../../src/domain/economia/economiaCampana.js';
import { sumarDias } from '../../src/domain/shared/util.js';

test('el viento se califica distinto según el cultivo', () => {
  assert.equal(calificarViento('soja', 25), 'bueno');
  assert.equal(calificarViento('soja', 35), 'regular');
  assert.equal(calificarViento('soja', 50), 'malo');
  assert.equal(calificarViento('maiz', 35), 'bueno', 'el maíz tolera más viento que la soja');
  assert.equal(calificarViento('maiz', 60), 'malo');
  assert.equal(calificarViento('trigo', 40), 'regular');
  assert.equal(calificarViento('soja', null), 'desconocido');
  assert.equal(calificarViento('cultivo-raro', 80), 'desconocido');
});

test('la humedad del grano se estima del aire y sube con la lluvia', () => {
  assert.equal(humedadDeEquilibrio('soja', 70), 13);
  assert.ok(humedadDeEquilibrio('soja', 65) > 11 && humedadDeEquilibrio('soja', 65) < 13);
  assert.ok(humedadDeEquilibrio('girasol', 70) < humedadDeEquilibrio('maiz', 70));
  assert.equal(estimarHumedadGrano({ cultivo: 'soja', humedadRelativaPct: 70, lluviaMm: 0 }), 13);
  assert.equal(estimarHumedadGrano({ cultivo: 'soja', humedadRelativaPct: 70, lluviaMm: 12 }), 14.5);
  assert.equal(estimarHumedadGrano({ cultivo: 'soja', humedadRelativaPct: null }), null);
});

test('califica la humedad del grano contra el rango de cosecha del cultivo', () => {
  assert.equal(calificarHumedadGrano('soja', 14), 'bueno');
  assert.equal(calificarHumedadGrano('soja', 11), 'regular', 'demasiado seca: desgrana');
  assert.equal(calificarHumedadGrano('soja', 16), 'regular');
  assert.equal(calificarHumedadGrano('soja', 18), 'malo');
  assert.equal(calificarHumedadGrano('maiz', 20), 'bueno');
});

test('secar cuesta merma y tarifa por cada punto sobre el objetivo', () => {
  const seco = costoDeSecado({ humedadPct: 13, objetivoPct: 13.5 });
  assert.deepEqual([seco.puntos, seco.mermaPct, seco.usdPorTonelada], [0, 0, 0]);
  const humedo = costoDeSecado({ humedadPct: 16, objetivoPct: 14 });
  assert.equal(humedo.puntos, 2);
  assert.ok(humedo.mermaPct > 2 && humedo.usdPorTonelada > 1);
});

test('el riesgo de la silobolsa sube con la humedad con la que se embolsa', () => {
  assert.equal(riesgoSilobolsaPorHumedad('soja', 13).nivel, 'bajo');
  assert.equal(riesgoSilobolsaPorHumedad('soja', 15).nivel, 'medio');
  assert.equal(riesgoSilobolsaPorHumedad('soja', 17).nivel, 'alto');
  assert.ok(riesgoSilobolsaPorHumedad('soja', 17).mermaMensualPct > riesgoSilobolsaPorHumedad('soja', 13).mermaMensualPct);
  assert.equal(riesgoSilobolsaPorHumedad('girasol', 12).nivel, 'medio', 'el girasol tiene un máximo más bajo');
  assert.equal(riesgoSilobolsaPorHumedad('soja', null).nivel, 'sin-dato');
});

test('el día se califica por lluvia, viento y humedad y gana la peor condición', () => {
  const dias = combinarPronostico({
    desde: '2027-04-10',
    hasta: '2027-04-12',
    cultivo: 'soja',
    pronostico: [
      { fecha: '2027-04-10', lluviaMm: 0, rafagaKmh: 20, humedadRelPct: 70 },
      { fecha: '2027-04-11', lluviaMm: 0, rafagaKmh: 55, humedadRelPct: 65 },
      { fecha: '2027-04-12', lluviaMm: 0, rafagaKmh: 20, humedadRelPct: 95 },
    ],
  });
  assert.deepEqual(dias.map((d) => d.apto), ['bueno', 'malo', 'malo']);
  assert.ok(dias[1].motivos.includes('viento fuerte'));
  assert.ok(dias[2].motivos.includes('grano húmedo'));
  assert.equal(dias[0].calificaciones.lluvia, 'bueno');

  const mismoVientoEnMaiz = combinarPronostico({ desde: '2027-04-11', hasta: '2027-04-11', cultivo: 'maiz', pronostico: [{ fecha: '2027-04-11', lluviaMm: 0, rafagaKmh: 50, humedadRelPct: 65 }] });
  assert.equal(mismoVientoEnMaiz[0].calificaciones.viento, 'regular', '50 km/h no es grave para maíz pero sí para soja');
});

test('la climatología usa la probabilidad histórica de ráfagas y la humedad media', () => {
  const fechas = [];
  for (let fecha = '2021-01-01'; fecha <= '2023-12-31'; fecha = sumarDias(fecha, 1)) fechas.push(fecha);
  const ventosa = resumirClimatologia({ fechas, lluviaMm: fechas.map(() => 0), rafagaKmh: fechas.map(() => 60), humedadRelPct: fechas.map(() => 90) });
  assert.equal(ventosa['04-10'].probRafaga[55], 1);
  assert.equal(ventosa['04-10'].humedadRelMedia, 90);

  const dias = combinarPronostico({ desde: '2027-04-10', hasta: '2027-04-10', cultivo: 'soja', climatologia: ventosa });
  assert.equal(dias[0].fuente, 'climatologia');
  assert.equal(dias[0].calificaciones.viento, 'malo');
  assert.equal(dias[0].calificaciones.humedad, 'malo');

  const sinCultivo = combinarPronostico({ desde: '2027-04-10', hasta: '2027-04-10', climatologia: ventosa });
  assert.equal(sinCultivo[0].calificaciones.viento, 'desconocido');
});

const simulacionHumeda = () => ({
  entrada: { cultivo: 'soja', qqHa: 38, destinos: [
    { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 300 },
    { nombre: 'Cooperativa local', tipo: 'acopio', precioUsdPorT: 303, distanciaKm: 35 },
    { nombre: 'Puerto Gran Rosario', tipo: 'puerto', precioUsdPorT: 335, distanciaKm: 230 },
  ] },
  saturacion: { dias: [] },
  plan: {
    toneladas: 1000,
    urgencia: 'media',
    alternativas: [
      { destino: 'Silobolsa en el campo', tipo: 'silobolsa', costo_usd: 30000, costo_extraccion_usd: 3000, ingreso_usd: 300000, costos_por_servicio: { cosecha: 20000, almacenaje: 7000 } },
      { destino: 'Cooperativa local', tipo: 'acopio', costo_usd: 23000, ingreso_usd: 303000, costos_por_servicio: { cosecha: 20000, transporte: 3000 } },
      { destino: 'Puerto Gran Rosario', tipo: 'puerto', costo_usd: 25000, ingreso_usd: 335000, costos_por_servicio: { cosecha: 20000, transporte: 5000 } },
    ],
  },
});

test('el grano húmedo cuesta secado y merma, y la silobolsa pide secar antes de embolsar', () => {
  const cosecha = { inicio: '2027-04-01', fin: '2027-04-05' };
  const seca = armarEstrategia({ modo: 'grande', simulacion: simulacionHumeda(), hoy: '2027-03-20', cosecha, humedadGranoPct: 13 });
  const humeda = armarEstrategia({ modo: 'grande', simulacion: simulacionHumeda(), hoy: '2027-03-20', cosecha, humedadGranoPct: 17 });
  const de = (estrategia, tipo) => estrategia.modalidades.find((m) => m.tipo === tipo);

  assert.equal(de(seca, 'acopio').costos.secado, 0);
  assert.ok(de(humeda, 'acopio').costos.secado > 0);
  assert.ok(de(humeda, 'acopio').merma.secadoPct > 0);
  assert.ok(de(humeda, 'acopio').gananciaNetaUSD < de(seca, 'acopio').gananciaNetaUSD);
  assert.equal(de(humeda, 'acopio').humedad.puntosASecar, 3.5);

  assert.equal(de(seca, 'silobolsa').humedad.secarAntes, false);
  assert.equal(de(seca, 'silobolsa').riesgo.nivel, 'bajo');
  const humedaSilo = de(humeda, 'silobolsa');
  assert.equal(humedaSilo.riesgo.nivel, 'alto', 'embolsar a 17 % sin secar es riesgo alto');
  assert.ok(humedaSilo.humedad.mermaMensualPct >= 2);
  assert.equal(humedaSilo.curvaSilobolsa.at(-1).secarAntes, true, 'a 6 meses conviene secar antes de embolsar');
  assert.equal(humedaSilo.curvaSilobolsa.at(-1).riesgo, 'bajo');
  assert.equal(de(seca, 'silobolsa').curvaSilobolsa.at(-1).secarAntes, false);
  assert.ok(de(humeda, 'silobolsa').gananciaNetaUSD < de(seca, 'silobolsa').gananciaNetaUSD);
  assert.equal(de(humeda, 'puerto').humedad.objetivoPct, 13.5);
});

test('sin dato de humedad no inventa secado', () => {
  const sinDato = armarEstrategia({ modo: 'grande', simulacion: simulacionHumeda(), hoy: '2027-03-20', cosecha: { inicio: '2027-04-01', fin: '2027-04-05' } });
  const acopio = sinDato.modalidades.find((m) => m.tipo === 'acopio');
  assert.equal(acopio.costos.secado, 0);
  assert.equal(acopio.humedad, null);
});
