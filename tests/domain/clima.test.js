import test from 'node:test';
import assert from 'node:assert/strict';

import { lluviaAcumuladaPorPeriodo } from '../../src/domain/clima/diasDeLluvia.js';
import { corteCaminos } from '../../src/domain/clima/corteCaminos.js';

test('lluvia acumulada por periodo suma los eventos recientes', () => {
  const serie = [
    { fecha: '2025-05-10', lluviaMm: 1 },
    { fecha: '2025-05-11', lluviaMm: 8 },
    { fecha: '2025-05-12', lluviaMm: 18 },
    { fecha: '2025-05-13', lluviaMm: 20 },
  ];

  assert.equal(lluviaAcumuladaPorPeriodo(serie, 3), 47);
});

test('corte de caminos se activa con lluvia acumulada de 48 h mayor a 20 mm', () => {
  const resultado = corteCaminos({ lluvia48h: 22, sueloSaturado: true });
  assert.equal(resultado.cortado, true);
  assert.equal(resultado.nivel, 'RIESGO ELEVADO');
  assert.ok(resultado.horasCorte >= 27);
});

test('sin lluvia en 48 h se mantiene transitable', () => {
  const resultado = corteCaminos({ lluvia48h: 10 });
  assert.equal(resultado.cortado, false);
  assert.equal(resultado.nivel, 'TRANSITABLE');
});
