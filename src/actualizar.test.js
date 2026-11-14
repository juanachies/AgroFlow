const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { actualizar, parsearTablaCatac, parsearEstadiaCatac, decodificarGlifos, obtenerTipoCambio } =
  require('./actualizar');

const CODIFICAR = { 0: 'Ǩ', 1: 'ǩ', 2: 'Ǫ', 3: 'ǫ', 4: 'Ǭ', 5: 'ǭ', 6: 'Ǯ', 7: 'ǯ', 8: 'ǰ', 9: 'Ǳ', '.': 'Ȯ', ',': 'ȯ' };
const codificar = (texto) => [...texto].map((c) => CODIFICAR[c] ?? c).join('');

function textoPdf(puntos) {
  return puntos.map(({ km, ars }) => `${codificar(String(km))}   ${codificar(ars)}`).join('\n');
}

const conMiles = (km) => (km >= 1000 ? `${Math.floor(km / 1000)}.${String(km % 1000).padStart(3, '0')}` : String(km));

function tablaSintetica(cantidad = 1000) {
  return Array.from({ length: cantidad }, (_, i) => ({
    km: conMiles(i + 1),
    ars: (9636.69 + i * 85.5).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }));
}

function copiaDatos() {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'datos-')), 'maquinaria.json');
  fs.copyFileSync(path.join(__dirname, '..', 'datos', 'maquinaria.json'), ruta);
  return ruta;
}

test('decodifica los glifos de la fuente de CATAC', () => {
  assert.equal(decodificarGlifos('ǱȮǮǫǮȯǮǱ'), '9.636,69');
});

test('parsea la tabla de km y precios', () => {
  const tabla = parsearTablaCatac(textoPdf(tablaSintetica()));
  assert.equal(tabla.length, 1000);
  assert.deepEqual(tabla[0], { km: 1, ars: 9636.69 });
});

test('lee km con separador de miles y la estadía', () => {
  const puntos = [...tablaSintetica(1000), { km: '1.003', ars: '108.196,08' }];
  const texto = `${textoPdf(puntos)}\nValor de estadía:   $214.146,67`;
  const tabla = parsearTablaCatac(texto);
  assert.deepEqual(tabla[tabla.length - 1], { km: 1003, ars: 108196.08 });
  assert.equal(parsearEstadiaCatac(texto), 214146.67);
});

test('una tabla incompleta se rechaza', () => {
  assert.throws(() => parsearTablaCatac(textoPdf(tablaSintetica(50))), /incompleta/);
});

test('una tabla con tarifas que bajan se rechaza', () => {
  const puntos = tablaSintetica();
  puntos[500].ars = '1,00';
  assert.throws(() => parsearTablaCatac(textoPdf(puntos)), /inconsistente/);
});

test('el tipo de cambio usa la venta oficial', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ venta: 1570, fechaActualizacion: 'hoy' }) });
  assert.deepEqual(await obtenerTipoCambio(fetcher), { valor: 1570, fecha: 'hoy' });
});

test('si la web falla se conservan los datos previos y se informa', async () => {
  const ruta = copiaDatos();
  const antes = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const fetcher = async () => ({ ok: false, status: 503 });
  const resultado = await actualizar({ ruta, fetcher });
  const despues = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  assert.match(resultado.tipo_cambio, /503/);
  assert.match(resultado.flete, /503/);
  assert.deepEqual(despues.flete.tabla_ars_por_t, antes.flete.tabla_ars_por_t);
  assert.equal(despues.parametros_generales.tipo_cambio_ars_usd, antes.parametros_generales.tipo_cambio_ars_usd);
});

test('con la web disponible se actualizan cambio y tabla de flete', async () => {
  const ruta = copiaDatos();
  const medio = { source_url: 'https://x/TARIFA-REFERENCIA-1.pdf', date: '2026-04-20T12:25:55' };
  const fetcher = async (url) => {
    if (url.includes('dolarapi')) return { ok: true, json: async () => ({ venta: 1570, fechaActualizacion: 'hoy' }) };
    if (url.includes('wp-json')) return { ok: true, json: async () => [medio] };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const leerPdf = async () => textoPdf(tablaSintetica());
  const resultado = await actualizar({ ruta, fetcher, leerPdf });
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  assert.equal(resultado.tipo_cambio, 'actualizado');
  assert.equal(resultado.flete, 'actualizado');
  assert.equal(datos.parametros_generales.tipo_cambio_ars_usd, 1570);
  assert.equal(datos.flete.tabla_ars_por_t.length, 1000);
  assert.equal(datos.flete.factor_actualizacion, 1);
});
