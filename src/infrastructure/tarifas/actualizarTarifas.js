import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parsearEstadiaCatac, parsearTablaCatac } from './catacPdf.js';
import { RUTA_TARIFAS } from './tarifasJsonAdapter.js';

const execFileAsync = promisify(execFile);

const URL_DOLAR = 'https://dolarapi.com/v1/dolares/oficial';
const URL_PDF_CATAC =
  'https://api.apicatac.com/wp-json/wp/v2/media?search=TARIFA-REFERENCIA&orderby=date&order=desc&per_page=10&mime_type=application/pdf';
const TIMEOUT_MS = 20000;

async function pedir(url, fetcher) {
  const respuesta = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`);
  return respuesta;
}

export async function obtenerTipoCambio(fetcher = fetch) {
  const datos = await (await pedir(URL_DOLAR, fetcher)).json();
  if (!Number.isFinite(datos.venta) || datos.venta <= 0) throw new Error('dolarapi devolvió una cotización inválida');
  return { valor: datos.venta, fecha: datos.fechaActualizacion };
}

async function extraerTextoPdf(buffer) {
  const carpeta = await mkdtemp(join(tmpdir(), 'catac-'));
  try {
    const archivo = join(carpeta, 'tarifa.pdf');
    await writeFile(archivo, buffer);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', archivo, '-'], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

export async function obtenerTablaCatac(fetcher = fetch, leerPdf = extraerTextoPdf) {
  const medios = await (await pedir(URL_PDF_CATAC, fetcher)).json();
  const candidatos = medios.filter((m) => /TARIFA-REFERENCIA/i.test(m.source_url));
  if (candidatos.length === 0) throw new Error('CATAC no publica ningún PDF de tarifa de referencia');
  let ultimoError;
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
      ultimoError = error;
    }
  }
  throw ultimoError;
}

async function intentar(nombre, tarea) {
  try {
    return { ok: true, ...(await tarea()) };
  } catch (error) {
    return { ok: false, error: `${nombre}: ${error.message}` };
  }
}

export async function actualizarTarifas({
  ruta = RUTA_TARIFAS,
  fetcher = fetch,
  leerPdf = extraerTextoPdf,
  ahora = new Date(),
} = {}) {
  const tarifas = JSON.parse(await readFile(ruta, 'utf8'));
  const [cambio, catac] = await Promise.all([
    intentar('tipo de cambio', () => obtenerTipoCambio(fetcher)),
    intentar('flete CATAC', () => obtenerTablaCatac(fetcher, leerPdf)),
  ]);

  if (cambio.ok) {
    tarifas.parametros_generales.tipo_cambio_ars_usd = cambio.valor;
    tarifas.parametros_generales.tipo_cambio_nota = `Dólar oficial, venta, dolarapi.com, ${cambio.fecha}.`;
  }
  if (catac.ok) {
    tarifas.flete.tabla_ars_por_t = catac.tabla;
    tarifas.flete.factor_actualizacion = 1;
    tarifas.flete.factor_nota = 'La tabla ya es la última publicada por CATAC; no se aplica ajuste.';
    tarifas.flete.fuente_url = catac.url;
    tarifas.flete.fuente_fecha = catac.fecha;
    if (catac.estadia) {
      tarifas.flete.estadia_ars_por_dia = catac.estadia;
      tarifas.flete.estadia_nota = 'Valor de estadía por día publicado por CATAC junto con la tabla.';
    }
  }

  tarifas.actualizacion = {
    fecha: ahora.toISOString(),
    tipo_cambio: cambio.ok ? 'actualizado' : cambio.error,
    flete: catac.ok ? 'actualizado' : catac.error,
    manual: ['cosecha (FACMA)', 'tractor y tolva', 'silobolsa', 'embolsado y extracción'],
  };
  await writeFile(ruta, `${JSON.stringify(tarifas, null, 2)}\n`);
  return tarifas.actualizacion;
}

export async function actualizarSiVencido({ maxHoras = 24, ruta = RUTA_TARIFAS, ...opciones } = {}) {
  const previa = JSON.parse(await readFile(ruta, 'utf8')).actualizacion;
  const edadHoras = previa ? (Date.now() - new Date(previa.fecha)) / 36e5 : Infinity;
  return edadHoras >= maxHoras ? actualizarTarifas({ ruta, ...opciones }) : previa;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  actualizarTarifas().then(
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
