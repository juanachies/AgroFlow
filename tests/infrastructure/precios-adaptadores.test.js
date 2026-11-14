// Adaptadores de PreciosPort: manual (pizarra en pesos + futuros A3) y simulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPreciosManualAdapter } from '../../src/infrastructure/precios/preciosManualAdapter.js';
import { crearPreciosSimuladosAdapter } from '../../src/infrastructure/precios/preciosSimuladosAdapter.js';

const HOY = '2026-11-14';

test('manual: convierte la pizarra con el tipo de cambio y normaliza las posiciones a AAAA-MM', async () => {
  const precios = crearPreciosManualAdapter({ datos: { fecha: HOY, tipoCambio: 1450, cultivos: { soja: { pizarraARSt: 435000, futuros: [{ posicion: 'ENE27', precioUSDt: 306 }, { posicion: '2027-05', precioUSDt: 296 }] } } } });
  const p = await precios.precios('soja');
  assert.equal(p.spot, 300);
  assert.deepEqual(p.futuros, [{ mes: '2027-01', precio: 306 }, { mes: '2027-05', precio: 296 }]);
  await assert.rejects(precios.precios('girasol'), /no hay precios/);
});

test('manual: usa el tipo de cambio de tarifas si el JSON no trae uno, o el disponible en USD', async () => {
  const sinTc = crearPreciosManualAdapter({ datos: { cultivos: { maiz: { pizarraARSt: 314000 }, trigo: { disponibleUSDt: 210 } } }, tipoCambio: 1570 });
  assert.equal((await sinTc.precios('maiz')).spot, 200);
  assert.equal((await sinTc.precios('trigo')).spot, 210);
});

test('manual: el archivo de ejemplo del repo es válido', async () => {
  const precios = crearPreciosManualAdapter({ ruta: new URL('../../data/precios-ejemplo.json', import.meta.url) });
  for (const c of ['soja', 'maiz', 'trigo']) {
    const p = await precios.precios(c);
    assert.ok(p.spot > 0 && p.futuros.length > 0);
  }
});

test('simulado: curva con carry y meses a partir de hoy', async () => {
  const p = await crearPreciosSimuladosAdapter({ hoy: HOY }).precios('soja');
  assert.equal(p.futuros[0].mes, '2026-12');
  assert.ok(p.futuros.at(-1).precio > p.spot);
  assert.throws(() => crearPreciosSimuladosAdapter(), /hoy/);
});
