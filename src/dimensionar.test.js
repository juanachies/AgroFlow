const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toneladas,
  tarifaFleteUsdPorT,
  costoCosechaUsdPorHa,
  dimensionarCosecha,
  dimensionarSilobolsa,
} = require('./dimensionar');

const campo = { ha: 2000, qqHa: 35, cultivo: 'soja', diasDisponibles: 20, destino: 'puerto', distanciaKm: 50 };

test('toneladas convierte qq/ha en t', () => {
  assert.equal(toneladas(100, 35), 350);
});

const datosFijos = {
  parametros_generales: { tipo_cambio_ars_usd: 1000 },
  flete: {
    factor_actualizacion: 1.5,
    tabla_ars_por_t: [
      { km: 10, ars: 10000 },
      { km: 100, ars: 20000 },
    ],
  },
};

test('flete aplica ajuste, interpola entre puntos y pasa a USD', () => {
  assert.equal(tarifaFleteUsdPorT(100, datosFijos), 30);
  assert.equal(tarifaFleteUsdPorT(55, datosFijos), 22.5);
  assert.equal(tarifaFleteUsdPorT(5, datosFijos), 15);
});

test('flete fuera de la tabla falla de forma explícita', () => {
  assert.throws(() => tarifaFleteUsdPorT(101, datosFijos), RangeError);
});

test('costo de cosecha de soja coincide con los puntos de FACMA', () => {
  assert.equal(costoCosechaUsdPorHa('soja', 24), 97);
  assert.ok(Math.abs(costoCosechaUsdPorHa('soja', 50) - 150) < 1e-9);
});

test('más urgencia nunca pide menos cosechadoras que menos urgencia', () => {
  const baja = dimensionarCosecha({ ...campo, urgencia: 'baja' });
  const alta = dimensionarCosecha({ ...campo, urgencia: 'alta' });
  assert.ok(alta.cosechadoras.cantidad * alta.cosechadoras.ha_por_dia >=
    baja.cosechadoras.cantidad * baja.cosechadoras.ha_por_dia);
});

test('urgencia media elige la opción más barata y alta la que termina antes', () => {
  const media = dimensionarCosecha({ ...campo, urgencia: 'media' });
  const alta = dimensionarCosecha({ ...campo, urgencia: 'alta' });
  const costos = media.cosechadoras_alternativas.map((o) => o.costo_usd);
  assert.equal(media.cosechadoras.costo_usd, Math.min(...costos));
  const dias = alta.cosechadoras_alternativas.map((o) => o.dias);
  assert.equal(alta.cosechadoras.dias, Math.min(...dias));
});

test('mayor distancia pide más camiones', () => {
  const cerca = dimensionarCosecha({ ...campo, urgencia: 'media', distanciaKm: 50 });
  const lejos = dimensionarCosecha({ ...campo, urgencia: 'media', distanciaKm: 200 });
  assert.ok(lejos.camiones.elegido.cantidad > cerca.camiones.elegido.cantidad);
});

test('destino silobolsa no pide camiones y sí bolsas', () => {
  const r = dimensionarCosecha({ ...campo, urgencia: 'media', destino: 'silobolsa' });
  assert.equal(r.camiones, null);
  assert.equal(r.silobolsa.bolsas, Math.ceil(7000 / 190));
});

test('silobolsa usa la capacidad del grano', () => {
  const soja = dimensionarSilobolsa({ toneladas: 1000, cultivo: 'soja', dias: 5, urgencia: 'media' });
  const trigo = dimensionarSilobolsa({ toneladas: 1000, cultivo: 'trigo', dias: 5, urgencia: 'media' });
  assert.ok(soja.bolsas > trigo.bolsas);
  assert.equal(dimensionarSilobolsa({ toneladas: 100, cultivo: 'girasol', dias: 5, urgencia: 'baja' })
    .humedad_max_bajo_riesgo, 11);
});

test('entradas inválidas fallan', () => {
  assert.throws(() => dimensionarCosecha({ ...campo, ha: 0, urgencia: 'media' }), RangeError);
  assert.throws(() => dimensionarCosecha({ ...campo, urgencia: 'urgentisima' }), RangeError);
  assert.throws(() => dimensionarCosecha({ ...campo, urgencia: 'media', cultivo: 'arroz' }), RangeError);
  assert.throws(() => dimensionarCosecha({ ...campo, urgencia: 'media', destino: 'luna' }), RangeError);
});
