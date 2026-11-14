const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const RUTA_DATOS = path.join(__dirname, '..', 'datos', 'maquinaria.json');
const URL_DOLAR = 'https://dolarapi.com/v1/dolares/oficial';
const URL_PDF_CATAC =
  'https://api.apicatac.com/wp-json/wp/v2/media?search=TARIFA-REFERENCIA&orderby=date&order=desc&per_page=10&mime_type=application/pdf';
const TIMEOUT_MS = 20000;
const MIN_PUNTOS_TABLA = 900;

// El PDF de CATAC usa una fuente propia: cada dígito sale como un glifo distinto.
const GLIFOS = { Ǩ: '0', ǩ: '1', Ǫ: '2', ǫ: '3', Ǭ: '4', ǭ: '5', Ǯ: '6', ǯ: '7', ǰ: '8', Ǳ: '9', Ȯ: '.', ȯ: ',' };

function decodificarGlifos(texto) {
  return [...texto].map((c) => GLIFOS[c] ?? c).join('');
}

function parsearPrecio(texto) {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function parsearTablaCatac(textoPdf) {
  const pares = decodificarGlifos(textoPdf).matchAll(
    /(?<![\d.,])(\d{1,3}(?:\.\d{3})?)[ \t]+(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d.,])/g,
  );
  const porKm = new Map();
  for (const [, km, precio] of pares) porKm.set(Number(km.replace('.', '')), parsearPrecio(precio));
  const tabla = [...porKm].map(([km, ars]) => ({ km, ars })).sort((a, b) => a.km - b.km);
  validarTablaCatac(tabla);
  return tabla;
}

function parsearEstadiaCatac(textoPdf) {
  const coincidencia = decodificarGlifos(textoPdf).match(/estad[ií]a:\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return coincidencia ? parsearPrecio(coincidencia[1]) : null;
}

function validarTablaCatac(tabla) {
  if (tabla.length < MIN_PUNTOS_TABLA) {
    throw new Error(`tabla CATAC incompleta: ${tabla.length} puntos, se esperaban al menos ${MIN_PUNTOS_TABLA}`);
  }
  const creciente = tabla.every((p, i) => i === 0 || p.ars >= tabla[i - 1].ars);
  if (!creciente) throw new Error('tabla CATAC inconsistente: las tarifas no crecen con los km');
}

async function pedir(url, fetcher) {
  const respuesta = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`);
  return respuesta;
}

async function obtenerTipoCambio(fetcher = fetch) {
  const datos = await (await pedir(URL_DOLAR, fetcher)).json();
  if (!Number.isFinite(datos.venta) || datos.venta <= 0) throw new Error('dolarapi devolvió una cotización inválida');
  return { valor: datos.venta, fecha: datos.fechaActualizacion };
}

async function extraerTextoPdf(buffer) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'catac-'));
  try {
    const archivo = path.join(carpeta, 'tarifa.pdf');
    fs.writeFileSync(archivo, buffer);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', archivo, '-'], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

async function obtenerTablaCatac(fetcher = fetch, leerPdf = extraerTextoPdf) {
  const medios = await (await pedir(URL_PDF_CATAC, fetcher)).json();
  const candidatos = medios.filter((m) => /TARIFA-REFERENCIA/i.test(m.source_url));
  if (candidatos.length === 0) throw new Error('CATAC no publica ningún PDF de tarifa de referencia');
  for (const medio of candidatos) {
    try {
      const pdf = Buffer.from(await (await pedir(medio.source_url, fetcher)).arrayBuffer());
      const texto = await leerPdf(pdf);
      return {
        tabla: parsearTablaCatac(texto),
        estadia: parsearEstadiaCatac(texto),
        url: medio.source_url,
        fecha: medio.date,
      };
    } catch (error) {
      if (medio === candidatos[candidatos.length - 1]) throw error;
    }
  }
}

async function intentar(nombre, tarea) {
  try {
    return { ok: true, ...(await tarea()) };
  } catch (error) {
    return { ok: false, error: `${nombre}: ${error.message}` };
  }
}

async function actualizar({ ruta = RUTA_DATOS, fetcher = fetch, leerPdf = extraerTextoPdf, ahora = new Date() } = {}) {
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const [cambio, catac] = await Promise.all([
    intentar('tipo de cambio', () => obtenerTipoCambio(fetcher)),
    intentar('flete CATAC', () => obtenerTablaCatac(fetcher, leerPdf)),
  ]);

  if (cambio.ok) {
    datos.parametros_generales.tipo_cambio_ars_usd = cambio.valor;
    datos.parametros_generales.tipo_cambio_nota = `Dólar oficial, venta, dolarapi.com, ${cambio.fecha}.`;
  }
  if (catac.ok) {
    datos.flete.tabla_ars_por_t = catac.tabla;
    datos.flete.factor_actualizacion = 1;
    datos.flete.factor_nota = 'La tabla ya es la última publicada por CATAC; no se aplica ajuste.';
    datos.flete.fuente_url = catac.url;
    datos.flete.fuente_fecha = catac.fecha;
    if (catac.estadia) {
      datos.flete.estadia_ars_por_dia = catac.estadia;
      datos.flete.estadia_nota = 'Valor de estadía por día publicado por CATAC junto con la tabla.';
    }
  }

  datos.actualizacion = {
    fecha: ahora.toISOString(),
    tipo_cambio: cambio.ok ? 'actualizado' : cambio.error,
    flete: catac.ok ? 'actualizado' : catac.error,
    manual: ['cosecha (FACMA)', 'tractor y tolva', 'silobolsa', 'embolsado y extracción'],
  };
  fs.writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
  return datos.actualizacion;
}

async function actualizarSiVencido({ maxHoras = 24, ruta = RUTA_DATOS, ...opciones } = {}) {
  const previa = JSON.parse(fs.readFileSync(ruta, 'utf8')).actualizacion;
  const edadHoras = previa ? (Date.now() - new Date(previa.fecha)) / 36e5 : Infinity;
  return edadHoras >= maxHoras ? actualizar({ ruta, ...opciones }) : previa;
}

module.exports = {
  actualizar,
  actualizarSiVencido,
  parsearTablaCatac,
  parsearEstadiaCatac,
  decodificarGlifos,
  obtenerTipoCambio,
};

if (require.main === module) {
  actualizar().then(
    (resultado) => {
      console.log(JSON.stringify(resultado, null, 2));
      if (resultado.tipo_cambio !== 'actualizado' || resultado.flete !== 'actualizado') process.exitCode = 1;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
