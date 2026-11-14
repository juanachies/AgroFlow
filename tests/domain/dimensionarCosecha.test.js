import assert from 'node:assert/strict';
import test from 'node:test';
import { costoCosechaUsdPorHa } from '../../src/domain/maquinaria/costoCosecha.js';
import { dimensionarCosecha } from '../../src/domain/maquinaria/dimensionarCosecha.js';
import { dimensionarSilobolsa } from '../../src/domain/silobolsa/dimensionadoSilobolsa.js';
import { toneladas } from '../../src/domain/shared/unidades.js';
import { tarifas } from '../helpers/tarifas.js';

const campo = { ha: 2000, qqHa: 35, cultivo: 'soja', diasDisponibles: 20, destino: 'puerto', distanciaKm: 50 };
const dimensionar = (cambios) => dimensionarCosecha({ ...campo, ...cambios }, tarifas);

test('toneladas convierte qq/ha en t', () => {
  assert.equal(toneladas(100, 35), 350);
});

test('el costo de cosecha de soja coincide con los puntos de FACMA', () => {
  assert.equal(costoCosechaUsdPorHa('soja', 24, tarifas), 97);
  assert.ok(Math.abs(costoCosechaUsdPorHa('soja', 50, tarifas) - 150) < 1e-9);
});

test('más urgencia nunca pide menos capacidad de cosecha', () => {
  const baja = dimensionar({ urgencia: 'baja' }).cosechadoras;
  const alta = dimensionar({ urgencia: 'alta' }).cosechadoras;
  assert.ok(alta.cantidad * alta.ha_por_dia >= baja.cantidad * baja.ha_por_dia);
});

test('urgencia media elige la opción más barata y alta la que termina antes', () => {
  const media = dimensionar({ urgencia: 'media' });
  const alta = dimensionar({ urgencia: 'alta' });
  assert.equal(media.cosechadoras.costo_usd, Math.min(...media.cosechadoras_alternativas.map((o) => o.costo_usd)));
  assert.equal(alta.cosechadoras.dias, Math.min(...alta.cosechadoras_alternativas.map((o) => o.dias)));
});

test('mayor distancia pide más camiones', () => {
  const cerca = dimensionar({ urgencia: 'media', distanciaKm: 50 });
  const lejos = dimensionar({ urgencia: 'media', distanciaKm: 200 });
  assert.ok(lejos.camiones.elegido.cantidad > cerca.camiones.elegido.cantidad);
});

test('sin destino solo se dimensiona la cosecha', () => {
  const r = dimensionar({ urgencia: 'media', destino: undefined });
  assert.equal(r.camiones, null);
  assert.equal(r.silobolsa, null);
  assert.equal(r.costo_total_usd, r.cosechadoras.costo_usd + r.tractores.costo_usd);
});

test('destino silobolsa no pide camiones y sí bolsas', () => {
  const r = dimensionar({ urgencia: 'media', destino: 'silobolsa' });
  assert.equal(r.camiones, null);
  assert.equal(r.silobolsa.bolsas, Math.ceil(7000 / tarifas.silobolsa.por_cultivo.soja.capacidad_t));
});

test('la silobolsa usa la capacidad y la humedad de cada grano', () => {
  const dimensionarGrano = (cultivo, toneladasGrano = 1000) =>
    dimensionarSilobolsa({ toneladas: toneladasGrano, cultivo, dias: 5, urgencia: 'media' }, tarifas);
  assert.ok(dimensionarGrano('soja').bolsas > dimensionarGrano('trigo').bolsas);
  assert.equal(dimensionarGrano('girasol', 100).humedad_max_bajo_riesgo, 11);
});

test('las entradas inválidas fallan de forma explícita', () => {
  assert.throws(() => dimensionar({ ha: 0, urgencia: 'media' }), RangeError);
  assert.throws(() => dimensionar({ urgencia: 'urgentisima' }), RangeError);
  assert.throws(() => dimensionar({ urgencia: 'media', cultivo: 'arroz' }), RangeError);
  assert.throws(() => dimensionar({ urgencia: 'media', destino: 'luna' }), RangeError);
});
