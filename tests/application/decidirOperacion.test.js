import test from 'node:test';
import assert from 'node:assert/strict';

import { crearConsultarClima, crearDecidirOperacion } from '../../src/application/usecases/decidirOperacion.js';
import { OpenMeteoClimatologiaAdapter } from '../../src/infrastructure/clima/openMeteoClimatologiaAdapter.js';
import { resumirClimatologia } from '../../src/domain/clima/climatologia.js';
import { sumarDias } from '../../src/domain/shared/util.js';

const AHORA = () => new Date('2027-03-20T12:00:00Z');

const simulacion = {
  entrada: { fechaInicioCosecha: '2027-04-10' },
  lote: { lat: -33.9, lon: -60.6 },
  distancias: [],
  saturacion: null,
  plan: {
    toneladas: 1000,
    dias_efectivos: 5,
    recomendado: {
      destino: 'Cooperativa local',
      tipo: 'acopio',
      pedidos: [{ servicio: 'cosecha', recurso: 'cosechadora', cantidad: 1, pedir_antes_del: '2027-03-30', usar_desde: '2027-04-10', usar_hasta: '2027-04-14' }],
    },
  },
};

function climaFalso(llamadas = []) {
  return {
    async obtenerPronostico(parametros) {
      llamadas.push(parametros);
      const time = [];
      for (let fecha = parametros.startDate; fecha <= parametros.endDate; fecha = sumarDias(fecha, 1)) time.push(fecha);
      return { daily: { time, precipitation_sum: time.map(() => 0) } };
    },
  };
}

function climatologiaFalsa(probFuerte) {
  const fechas = [];
  for (let fecha = '2021-01-01'; fecha <= '2021-12-31'; fecha = sumarDias(fecha, 1)) fechas.push(fecha);
  const lluviaMm = fechas.map(() => (probFuerte ? 20 : 0));
  return { async climatologiaDiaria() { return { resumen: resumirClimatologia({ fechas, lluviaMm }) }; } };
}

test('la decisión usa pronóstico cercano y climatología para la cosecha lejana', async () => {
  const llamadas = [];
  const decidir = crearDecidirOperacion({
    simularPlan: async () => simulacion,
    clima: climaFalso(llamadas),
    climatologia: climatologiaFalsa(false),
    fuentesExternas: true,
    ahora: AHORA,
  });
  const resultado = await decidir({ hoy: '2027-03-20' });

  assert.equal(resultado.decision.cosecha.fuenteClima, 'climatologia');
  assert.deepEqual(resultado.decision.clima.fuentes, { pronostico: true, climatologia: true });
  assert.equal(llamadas[0].startDate, '2027-03-21', 'arranca 20 días antes del inicio de cosecha');
  assert.equal(llamadas[0].endDate, '2027-04-04', 'el pronóstico se limita a 16 días desde hoy');
  assert.equal(resultado.plan.recomendado.destino, 'Cooperativa local', 'conserva la simulación para poder confirmar reservas');
});

test('sin fuentes externas decide con el plan y sin clima', async () => {
  const decidir = crearDecidirOperacion({ simularPlan: async () => simulacion, fuentesExternas: false, ahora: AHORA });
  const { decision } = await decidir({ hoy: '2027-03-20' });
  assert.equal(decision.cosecha.fuenteClima, 'sin-dato');
  assert.equal(decision.cosecha.inicio, '2027-04-10');
});

test('si una fuente de clima falla, sigue con la otra y lo informa', async () => {
  const decidir = crearDecidirOperacion({
    simularPlan: async () => simulacion,
    clima: { async obtenerPronostico() { throw new Error('timeout'); } },
    climatologia: climatologiaFalsa(false),
    fuentesExternas: true,
    ahora: AHORA,
  });
  const { decision } = await decidir({ hoy: '2027-03-20' });
  assert.deepEqual(decision.clima.fuentes, { pronostico: false, climatologia: true });
  assert.match(decision.clima.errores[0], /pronóstico no disponible \(timeout\)/);
});

test('la consulta pública de clima devuelve la serie diaria y valida el rango', async () => {
  const consultar = crearConsultarClima({ clima: climaFalso(), climatologia: climatologiaFalsa(true), ahora: AHORA });
  const respuesta = await consultar({ latitude: -33.9, longitude: -60.6, desde: '2027-03-20', hasta: '2027-04-30' });

  assert.equal(respuesta.dias.length, 42);
  assert.equal(respuesta.dias[0].fuente, 'pronostico');
  assert.equal(respuesta.dias.at(-1).fuente, 'climatologia');
  assert.equal(respuesta.dias.at(-1).apto, 'malo');
  assert.ok(respuesta.fuentes.pronostico && respuesta.fuentes.climatologia);
  await assert.rejects(() => consultar({ latitude: 0, longitude: 0, desde: '2027-04-30', hasta: '2027-03-20' }), /anterior/);
  await assert.rejects(() => consultar({ latitude: 0, longitude: 0, desde: '2027-01-01', hasta: '2029-01-01' }), /rango máximo/);
});

test('el adaptador histórico pide 10 años completos, resume y guarda en caché', async () => {
  const pedidos = [];
  const guardado = new Map();
  const adaptador = new OpenMeteoClimatologiaAdapter({
    ahora: AHORA,
    cache: { get: async (clave) => guardado.get(clave) ?? null, set: async (clave, valor) => { guardado.set(clave, valor); } },
    fetchImpl: async (url) => {
      pedidos.push(new URL(url));
      return { ok: true, status: 200, json: async () => ({ daily: { time: ['2025-04-10', '2026-04-10'], precipitation_sum: [20, 0] } }) };
    },
  });

  const resultado = await adaptador.climatologiaDiaria({ latitude: -33.949, longitude: -60.61 });
  assert.equal(pedidos[0].searchParams.get('start_date'), '2017-01-01');
  assert.equal(pedidos[0].searchParams.get('end_date'), '2026-12-31');
  assert.equal(pedidos[0].searchParams.get('latitude'), '-33.9');
  assert.equal(pedidos[0].searchParams.get('daily'), 'precipitation_sum,wind_gusts_10m_max,relative_humidity_2m_mean');
  assert.equal(resultado.resumen['04-10'].probFuerte, 0.5);

  await adaptador.climatologiaDiaria({ latitude: -33.9, longitude: -60.6 });
  assert.equal(pedidos.length, 1, 'la segunda consulta sale del caché');
  await assert.rejects(() => adaptador.climatologiaDiaria({ latitude: 200, longitude: 0 }));
});
