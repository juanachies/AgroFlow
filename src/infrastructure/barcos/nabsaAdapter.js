// Adaptador NABSA (North American Shipping Agencies): parser del line-up y BarcosPort.
//
// Fuente: https://www.nabsa.com.ar/assets/vessel_update.pdf (PDF exportado de Excel, se actualiza
// en días hábiles). Este parser recibe el TEXTO del PDF (extraído con pdf-parse / pdfjs en el
// servidor) y no depende de ninguna librería.
//
// Formato de cada fila (columnas del PDF):
//   Port | Terminal | Vessel | ETA/ETB/ETF | Ops | Tons | Commodity | Destination | Origin | Charterer
// Ejemplos:
//   SAN LORENZO RENOVA NORTH ROMY ETA REC 10/11 load 29.700  WHEAT ECUADOR ARGENTINA BUNGE
//   SAN LORENZO RENOVA SOUTH NORTH ISLAND ETB load 35.200  SOYBEANMEAL NEW ZEALAND ARGENTINA BUNGE
// Estado: ETF / BERTHED = cargando (en muelle), ETB / AT <lugar> = esperando muelle,
//         ETA <lugar> = anunciado (fecha estimada de arribo), (REJECTED) = se descarta.

import { readFileSync } from 'node:fs';
import { iso, sumarDias, diasEntre } from '../../domain/shared/util.js';

// Puertos NABSA -> puerto del modelo. Up-River (Gran Rosario) agrupa todas las terminales del río.
const PUERTOS_NABSA = [
  ['CONCEPCION DEL URUGUAY', null],
  ['VILLA CONSTITUCION', 'gran-rosario'],
  ['GENERAL LAGOS', 'gran-rosario'],
  ['PUNTA ALVEAR', 'gran-rosario'],
  ['ARROYO SECO', 'gran-rosario'],
  ['SAN LORENZO', 'gran-rosario'],
  ['SAN NICOLAS', 'gran-rosario'],
  ['SAN PEDRO', 'gran-rosario'],
  ['TIMBUES', 'gran-rosario'],
  ['ROSARIO', 'gran-rosario'],
  ['RAMALLO', 'gran-rosario'],
  ['BAHIA BLANCA', 'bahia-blanca'],
  ['NECOCHEA', 'quequen'],
  ['QUEQUEN', 'quequen'],
  ['DIAMANTE', null],
  ['ZARATE', null],
  ['LIMA', null],
  ['BUENOS AIRES', null],
  ['LA PLATA', null],
  ['CAMPANA', null],
];

// Commodity NABSA -> producto del modelo. El orden importa (prefijos más largos primero).
const PRODUCTOS_NABSA = [
  ['SOYBEANMEAL', 'harina-soja'],
  ['SOYBEAN MEAL', 'harina-soja'],
  ['SOYBEAN OIL', 'aceite-soja'],
  ['SOYA HULL PELLETS', 'otro'],
  ['SOYBEANS', 'soja'],
  ['SOYBEAN', 'soja'],
  ['CORN', 'maiz'],
  ['MAIZE', 'maiz'],
  ['WHEAT', 'trigo'],
  ['BARLEY', 'cebada'],
  ['SORGHUM', 'sorgo'],
];

const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const FILA = /^(?<pre>.+?)\s+(?<marca>ETA|ETB|ETF|AT|BERTHED|\(REJECTED\))(?<lugar>(?:\s+(?!load\b|discharge\b)[A-Z.]+){0,2})?(?:\s+(?<fecha>\d{1,2}\/\d{1,2}))?\s+(?<ops>load|discharge)\s+(?<tons>[\d.,]+)\s+(?<resto>.+)$/;

function fechaDelLineup(texto) {
  const m = texto.match(/Line\s*Up:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase()];
  return mes ? iso(`${m[3]}-${String(mes).padStart(2, '0')}-${m[2].padStart(2, '0')}`) : null;
}

// dd/mm -> fecha completa, eligiendo el año más cercano a la fecha del line-up.
function completarFecha(ddmm, fechaLineup) {
  const [d, m] = ddmm.split('/').map(Number);
  const anio = Number(fechaLineup.slice(0, 4));
  const candidatos = [anio - 1, anio, anio + 1].map((a) => iso(`${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`));
  return candidatos.reduce((a, c) => (Math.abs(diasEntre(fechaLineup, c)) < Math.abs(diasEntre(fechaLineup, a)) ? c : a));
}

function numero(txt) {
  return Number(String(txt).replace(/\./g, '').replace(',', '.'));
}

export function parsearLineupNABSA(texto) {
  const fecha = fechaDelLineup(texto);
  if (!fecha) throw new Error('No se encontró la fecha "Line Up: <Mes> <día>, <año>" en el texto de NABSA');
  const circular = texto.match(/Circ\.?\s*Nbr\.?:\s*(\d+)/i)?.[1] ?? null;
  const filas = [];
  const noReconocidas = [];

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.replace(/\s+/g, ' ').trim();
    if (!linea || /\bNIL$/.test(linea) || /^(Line Up|Notes|Port Terminal)/i.test(linea)) continue;
    const m = linea.match(FILA);
    if (!m) {
      if (/\b(load|discharge)\b/.test(linea)) noReconocidas.push(linea);
      continue;
    }
    const { pre, marca, lugar, fecha: ddmm, ops, tons, resto } = m.groups;
    const [puertoNabsa, puerto] = PUERTOS_NABSA.find(([p]) => pre.startsWith(p + ' ')) ?? [pre.split(' ')[0], null];
    const [, producto] = PRODUCTOS_NABSA.find(([c]) => resto.startsWith(c)) ?? [null, 'otro'];
    const estado = marca === '(REJECTED)' ? 'rechazado'
      : marca === 'ETF' || marca === 'BERTHED' ? 'cargando'
      : marca === 'ETA' ? 'anunciado'
      : 'fondeado';
    if (estado === 'rechazado') continue; // buque rechazado: no carga
    filas.push({
      puertoNabsa,
      puerto, // null si no es un puerto del modelo
      terminalYBuque: pre.slice(puertoNabsa.length).trim(),
      estado,
      referencia: `${marca}${lugar ?? ''}`.trim(), // p. ej. "ETA REC", "AT REC", "ETF"
      fecha: ddmm ? completarFecha(ddmm, fecha) : fecha,
      operacion: ops === 'load' ? 'carga' : 'descarga',
      toneladas: numero(tons),
      producto,
      detalle: resto,
    });
  }
  return { fuente: 'NABSA', fecha, circular, filas, noReconocidas };
}

// Convierte el line-up NABSA al formato del módulo Barcos (solo carga de granos soja/maíz/trigo).
export function nabsaALineup(nabsa) {
  return nabsa.filas
    .filter((f) => f.operacion === 'carga' && f.puerto && ['soja', 'maiz', 'trigo'].includes(f.producto))
    .map((f) => ({
      buque: f.terminalYBuque,
      puerto: f.puerto,
      cultivo: f.producto,
      toneladas: f.toneladas,
      // Para los que ya están cargando la fecha es la de fin (ETF): se toma la del line-up como llegada.
      eta: f.estado === 'cargando' ? nabsa.fecha : f.fecha,
      estado: f.estado,
    }));
}

// Toneladas a cargar por producto en un puerto, dentro de [desde, hasta] (incluye los que están cargando).
export function toneladasProgramadas(nabsa, puerto, desde = nabsa.fecha, hasta = sumarDias(nabsa.fecha, 21)) {
  const out = {};
  for (const f of nabsa.filas) {
    if (f.operacion !== 'carga' || f.puerto !== puerto) continue;
    if (f.estado === 'anunciado' && (f.fecha < desde || f.fecha > hasta)) continue;
    out[f.producto] = (out[f.producto] ?? 0) + f.toneladas;
  }
  return { desde, hasta, dias: diasEntre(desde, hasta) + 1, toneladas: out, fuente: `NABSA ${nabsa.fecha}` };
}

// Adaptador de BarcosPort sobre el line-up NABSA.
// texto: contenido del PDF ya extraído (p. ej. con pdf-parse en el servidor) o rutaTexto: archivo .txt.
// mercado: datos BCR de camiones / buques; si no trae `programadas`, se toman del propio line-up.
export function crearBarcosNabsaAdapter({ texto = null, rutaTexto = null, mercado = null, diasProgramadas = 21 } = {}) {
  const nabsa = parsearLineupNABSA(texto ?? readFileSync(rutaTexto, 'utf8'));
  const lineup = nabsaALineup(nabsa);
  return {
    async calendario(puerto, _desde, hasta) {
      // Los anunciados con ETA vencida siguen viniendo (atrasados): se conservan.
      return lineup.filter((b) => b.puerto === puerto && (b.estado !== 'anunciado' || b.eta <= hasta));
    },
    async mercado(puerto, fecha) {
      const programadas = mercado?.programadas ?? toneladasProgramadas(nabsa, puerto, fecha, sumarDias(fecha, diasProgramadas - 1));
      return { ...mercado, programadas };
    },
    origen: `NABSA ${nabsa.fecha} circ. ${nabsa.circular}`,
    nabsa,
  };
}
