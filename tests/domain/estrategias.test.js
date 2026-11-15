import test from 'node:test';
import assert from 'node:assert/strict';

import { armarEstrategias, AVISO_ESTRATEGIAS, CONFIANZA_MAXIMA, CONFIANZA_MINIMA, NIVEL_MEDIA_DESDE } from '../../src/domain/estrategia/index.js';

const HOY = '2027-03-20';

function modalidad(overrides = {}) {
  return {
    tipo: 'puerto',
    destino: 'Puerto Rosario',
    fechaCobro: '2027-04-10',
    diasHastaCobro: 21,
    precioUSDt: 330,
    gananciaNetaUSD: 300000,
    diferenciaVsMejorUSD: 0,
    costos: {},
    merma: { totalPct: 0.2 },
    riesgo: { probLlegar: 0.95, nivel: 'bajo' },
    humedad: null,
    elegida: true,
    ...overrides,
  };
}

function decision({
  modalidades = [modalidad()],
  rapida = null,
  coinciden = true,
  fuenteClima = 'pronostico',
  diasMalos = 0,
  diasConVientoFuerte = 0,
  fuentePrecios = 'PreciosPort',
  diasSaturados = [],
} = {}) {
  return {
    cosecha: { diasMalos, diasRegulares: 0, diasBuenos: 5, fuenteClima, humedadGranoPct: 13.2, diasConVientoFuerte },
    transporte: { diasSaturados, distanciaKm: 230, destino: 'Puerto Rosario' },
    condiciones: { humedadBaseRecibo: 13.5 },
    alertas: [],
    economia: {
      grande: { modalidades },
      rapida: { elegida: rapida },
      comparacion: { coinciden },
      fuentePrecios,
    },
  };
}

const estrategiaDe = (resultado, id) => resultado.estrategias.find((e) => e.id === id);

test('el índice de confianza queda acotado entre 5 y 95 aunque todos los factores resten', () => {
  const pesima = armarEstrategias({
    hoy: HOY,
    decision: decision({
      fuenteClima: 'sin-dato',
      diasMalos: 10,
      diasConVientoFuerte: 5,
      fuentePrecios: 'supuestos por defecto',
      diasSaturados: ['2027-04-01', '2027-04-02', '2027-04-03', '2027-04-04', '2027-04-05', '2027-04-06'],
      modalidades: [modalidad({
        tipo: 'silobolsa', mesesGuardado: 6, riesgo: { probLlegar: 0.1, nivel: 'alto' },
        humedad: { granoPct: 16, exceso: 3 },
      })],
    }),
  });
  const [estrategia] = pesima.estrategias;

  assert.equal(estrategia.confianza.indice, CONFIANZA_MINIMA);
  assert.equal(estrategia.confianza.nivel, 'baja');
  assert.ok(estrategia.confianza.indice >= CONFIANZA_MINIMA && estrategia.confianza.indice <= CONFIANZA_MAXIMA);
});

test('la climatología histórica baja la confianza frente al pronóstico', () => {
  const pronostico = estrategiaDe(armarEstrategias({ hoy: HOY, decision: decision() }), 'puerto');
  const climatologia = estrategiaDe(armarEstrategias({
    hoy: HOY,
    decision: decision({ fuenteClima: 'climatologia', modalidades: [modalidad({ riesgo: { probLlegar: null, nivel: 'sin-dato' } })] }),
  }), 'puerto');
  const conPronostico = estrategiaDe(armarEstrategias({
    hoy: HOY,
    decision: decision({ modalidades: [modalidad({ riesgo: { probLlegar: null, nivel: 'sin-dato' } })] }),
  }), 'puerto');

  assert.ok(climatologia.confianza.indice < conPronostico.confianza.indice);
  assert.ok(pronostico.confianza.indice > climatologia.confianza.indice);
});

test('la silobolsa con más meses tiene menos confianza que con menos meses', () => {
  const resultado = armarEstrategias({
    hoy: HOY,
    decision: decision({
      modalidades: [
        modalidad({ tipo: 'silobolsa', mesesGuardado: 4, riesgo: { probLlegar: null, nivel: 'bajo' }, gananciaNetaUSD: 310000 }),
        modalidad({ tipo: 'silobolsa', mesesGuardado: 1, riesgo: { probLlegar: null, nivel: 'bajo' }, gananciaNetaUSD: 300000 }),
      ],
    }),
  });

  assert.ok(estrategiaDe(resultado, 'silobolsa-4').confianza.indice < estrategiaDe(resultado, 'silobolsa-1').confianza.indice);
});

test('sin economía devuelve lista vacía y el aviso', () => {
  const resultado = armarEstrategias({ hoy: HOY, decision: { cosecha: {}, transporte: null } });

  assert.deepEqual(resultado.estrategias, []);
  assert.equal(resultado.aviso, AVISO_ESTRATEGIAS);
});

test('recomendadaPorModelo marca exactamente una de las estrategias con confianza media o alta', () => {
  const resultado = armarEstrategias({
    hoy: HOY,
    decision: decision({
      modalidades: [
        modalidad({ tipo: 'puerto', gananciaNetaUSD: 100000 }),
        modalidad({ tipo: 'acopio', destino: 'Cooperativa local', gananciaNetaUSD: 200000 }),
      ],
    }),
  });
  const candidatas = resultado.estrategias.filter((e) => e.confianza.indice >= NIVEL_MEDIA_DESDE);
  const recomendadas = resultado.estrategias.filter((e) => e.recomendadaPorModelo);

  assert.equal(recomendadas.length, 1);
  assert.equal(recomendadas[0].gananciaNetaUSD, Math.max(...candidatas.map((e) => e.gananciaNetaUSD)));
});

test('"Cosecha rápida" aparece solo si las estrategias no coinciden', () => {
  const rapida = modalidad({ tipo: 'puerto', gananciaNetaUSD: 250000, diferenciaVsMejorUSD: -50000 });
  const coinciden = armarEstrategias({ hoy: HOY, decision: decision({ rapida, coinciden: true }) });
  const noCoinciden = armarEstrategias({ hoy: HOY, decision: decision({ rapida, coinciden: false }) });

  assert.equal(estrategiaDe(coinciden, 'cosecha-rapida'), undefined);
  assert.equal(estrategiaDe(noCoinciden, 'cosecha-rapida').titulo, 'Cosecha rápida');
  assert.equal(noCoinciden.estrategias.length, coinciden.estrategias.length + 1);
});
