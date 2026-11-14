import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { actualizarTarifas, obtenerTipoCambio } from '../../src/infrastructure/tarifas/actualizarTarifas.js';
import { crearTarifasJsonAdapter, RUTA_TARIFAS } from '../../src/infrastructure/tarifas/tarifasJsonAdapter.js';
import { tablaSintetica, textoPdf } from '../helpers/catac.js';

async function copiaTarifas() {
  const ruta = join(await mkdtemp(join(tmpdir(), 'tarifas-')), 'tarifas.json');
  await copyFile(RUTA_TARIFAS, ruta);
  return ruta;
}

const leer = async (ruta) => JSON.parse(await readFile(ruta, 'utf8'));

test('el adaptador JSON cumple el puerto de tarifas', async () => {
  const vigentes = await crearTarifasJsonAdapter().vigentes();
  for (const bloque of ['parametros_generales', 'urgencia', 'cosecha', 'cosechadoras', 'flete', 'silobolsa', 'reserva']) {
    assert.ok(vigentes[bloque], `falta el bloque ${bloque}`);
  }
});

test('el tipo de cambio usa la venta oficial', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ venta: 1570, fechaActualizacion: 'hoy' }) });
  assert.deepEqual(await obtenerTipoCambio(fetcher), { valor: 1570, fecha: 'hoy' });
});

test('una cotización inválida se rechaza', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ venta: 0 }) });
  await assert.rejects(obtenerTipoCambio(fetcher), /inválida/);
});

test('si la web falla se conservan los datos previos y se informa', async () => {
  const ruta = await copiaTarifas();
  const antes = await leer(ruta);
  const resultado = await actualizarTarifas({ ruta, fetcher: async () => ({ ok: false, status: 503 }) });
  const despues = await leer(ruta);
  assert.match(resultado.tipo_cambio, /503/);
  assert.match(resultado.flete, /503/);
  assert.deepEqual(despues.flete.tabla_ars_por_t, antes.flete.tabla_ars_por_t);
  assert.equal(despues.parametros_generales.tipo_cambio_ars_usd, antes.parametros_generales.tipo_cambio_ars_usd);
});

test('con la web disponible se actualizan cambio, tabla y estadía', async () => {
  const ruta = await copiaTarifas();
  const medio = { source_url: 'https://x/TARIFA-REFERENCIA-1.pdf', date: '2026-04-20T12:25:55' };
  const fetcher = async (url) => {
    if (url.includes('dolarapi')) return { ok: true, json: async () => ({ venta: 1570, fechaActualizacion: 'hoy' }) };
    if (url.includes('wp-json')) return { ok: true, json: async () => [medio] };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const leerPdf = async () => `${textoPdf(tablaSintetica())}\nValor de estadía:   $214.146,67`;
  const resultado = await actualizarTarifas({ ruta, fetcher, leerPdf });
  const tarifas = await leer(ruta);
  assert.equal(resultado.tipo_cambio, 'actualizado');
  assert.equal(resultado.flete, 'actualizado');
  assert.equal(tarifas.parametros_generales.tipo_cambio_ars_usd, 1570);
  assert.equal(tarifas.flete.tabla_ars_por_t.length, 1000);
  assert.equal(tarifas.flete.factor_actualizacion, 1);
  assert.equal(tarifas.flete.estadia_ars_por_dia, 214146.67);
  assert.ok(tarifas.reserva, 'la actualización conserva los bloques que no toca');
});
