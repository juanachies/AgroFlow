import assert from 'node:assert/strict';
import test from 'node:test';
import { estadiaUsdPorDia, tarifaFleteUsdPorT } from '../../src/domain/flete/costoFlete.js';

const tarifasFijas = {
  parametros_generales: { tipo_cambio_ars_usd: 1000 },
  flete: {
    factor_actualizacion: 1.5,
    estadia_ars_por_dia: 200000,
    tabla_ars_por_t: [
      { km: 10, ars: 10000 },
      { km: 100, ars: 20000 },
    ],
  },
};

test('el flete aplica el ajuste, interpola entre puntos y pasa a USD', () => {
  assert.equal(tarifaFleteUsdPorT(100, tarifasFijas), 30);
  assert.equal(tarifaFleteUsdPorT(55, tarifasFijas), 22.5);
  assert.equal(tarifaFleteUsdPorT(5, tarifasFijas), 15);
});

test('el flete fuera de la tabla falla de forma explícita', () => {
  assert.throws(() => tarifaFleteUsdPorT(101, tarifasFijas), RangeError);
  assert.throws(() => tarifaFleteUsdPorT(0, tarifasFijas), RangeError);
});

test('la estadía se pasa a USD con el tipo de cambio', () => {
  assert.equal(estadiaUsdPorDia(tarifasFijas), 200);
});
