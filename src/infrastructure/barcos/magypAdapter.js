// Adaptador MAGyP (Subsecretaría de Mercados Agropecuarios): "Barcos anunciados" — fuente OFICIAL.
//
// Página: magyp.gob.ar → Mercados Agropecuarios → Logística → Posición de Buques en Puertos y
// Anunciados (Line up) → Buques Anunciados y Cargados. Descarga: buques_cargados_y_anunciados.xlsx.
// Es el line-up de NABSA agregado por el Estado: toneladas anunciadas por puerto, muelle y producto.
// Se prefiere a leer el PDF de NABSA directo porque es un dato público oficial.
//
// Formato (tabla "Barcos anunciados al DD-MM-AAAA"):
//   PUERTO | MUELLE | CEBADA | MAIZ | SUBPROD | TRIGO | SOJA | SUBPROD PY | SORGO | MALTA | Total general
//   filas por muelle, una fila "Total <PUERTO>" por puerto y "Total general" al final.
// El parser recibe el texto de la tabla con columnas separadas por tabulador, ';' o '|' (copiado de la
// web o exportado a CSV desde el Excel). Las celdas vacías tienen que conservarse, por eso no se
// aceptan espacios como separador. Números con punto de miles. Se usan solo las filas "Total <PUERTO>".
//
// Productos: MAIZ→maiz, SOJA→soja, TRIGO→trigo, CEBADA→cebada, SORGO→sorgo, SUBPROD→harinas
// (subproductos: harinas y pellets, sobre todo de soja; se usa como harina para la soja equivalente).
// Las columnas "PY" (mercadería de Paraguay en tránsito) se excluyen: no llega en camiones argentinos.

import { readFileSync } from 'node:fs';
import { sumarDias } from '../../domain/shared/util.js';

const PRODUCTOS = { MAIZ: 'maiz', 'MAÍZ': 'maiz', SOJA: 'soja', TRIGO: 'trigo', CEBADA: 'cebada', SORGO: 'sorgo', SUBPROD: 'harinas', MALTA: 'malta' };

const PUERTOS = [
  [/ROSARIO|SAN LORENZO|SAN PEDRO|VILLA CONSTITUCI|SAN NICOL|RAMALLO|ARROYO SECO|TIMB[UÚ]ES|GENERAL LAGOS|PUNTA ALVEAR/, 'gran-rosario'],
  [/BAH[IÍ]A BLANCA/, 'bahia-blanca'],
  [/NECOCHEA|QUEQU[EÉ]N/, 'quequen'],
];

function numero(c) {
  const t = String(c ?? '').trim();
  return t === '' ? 0 : Number(t.replace(/\./g, '').replace(',', '.'));
}

export function parsearAnunciadosMAGyP(texto, { fecha = null, diasPeriodo = 15 } = {}) {
  const lineas = String(texto).split(/\r?\n/);
  const m = String(texto).match(/anunciados al\s*(\d{2})-(\d{2})-(\d{4})/i);
  const desde = fecha ?? (m ? `${m[3]}-${m[2]}-${m[1]}` : null);
  if (!desde) throw new RangeError('falta la fecha: no se encontró "Barcos anunciados al DD-MM-AAAA" y no se pasó `fecha`');

  let columnas = null;
  const porPuerto = { 'gran-rosario': {}, 'bahia-blanca': {}, quequen: {}, otros: {} };
  const totalesPorPuerto = {};
  for (const cruda of lineas) {
    if (!/[\t;|]/.test(cruda)) continue;
    const celdas = cruda.split(/\t|;|\|/).map((c) => c.trim());
    if (/^PUERTO$/i.test(celdas[0])) {
      columnas = celdas.map((c) => c.toUpperCase());
      continue;
    }
    if (!columnas) continue;
    const t = celdas[0].match(/^Total\s+(.+)$/i);
    if (!t || /^general$/i.test(t[1].trim())) continue;
    const nombre = t[1].trim().toUpperCase();
    const destino = PUERTOS.find(([re]) => re.test(nombre))?.[1] ?? 'otros';
    totalesPorPuerto[nombre] = numero(celdas[columnas.indexOf('TOTAL GENERAL')]);
    columnas.forEach((col, i) => {
      const producto = PRODUCTOS[col];
      if (!producto) return; // PUERTO, MUELLE, columnas PY, Total general
      porPuerto[destino][producto] = (porPuerto[destino][producto] ?? 0) + numero(celdas[i]);
    });
  }
  if (!columnas) throw new RangeError('no se encontró el encabezado "PUERTO | MUELLE | ..." separado por tabulador, ";" o "|"');
  if (!Object.keys(totalesPorPuerto).length) throw new RangeError('no se encontraron filas "Total <PUERTO>"');
  return {
    fuente: 'MAGyP, Barcos anunciados (line-up NABSA)',
    desde,
    hasta: sumarDias(desde, diasPeriodo - 1),
    dias: diasPeriodo,
    porPuerto,
    totalesPorPuerto,
  };
}

// Formato de "toneladas programadas" que usan los índices del puerto (domain/barcos/indicesMercado.js).
export function programadasDe(magyp, puerto) {
  return { desde: magyp.desde, hasta: magyp.hasta, dias: magyp.dias, toneladas: magyp.porPuerto[puerto] ?? {}, fuente: magyp.fuente };
}

/**
 * Envuelve un BarcosPort (calendario por buque: NABSA, CSV o simulado) y le agrega como `mercado`
 * las toneladas programadas oficiales de MAGyP y, si se pasan, los camiones del día.
 */
export function conProgramadasMAGyP(barcos, { texto = null, ruta = null, camiones = null, diasPeriodo = 15 } = {}) {
  const magyp = parsearAnunciadosMAGyP(texto ?? readFileSync(ruta, 'utf8'), { diasPeriodo });
  return {
    ...barcos,
    async mercado(puerto, fecha) {
      const propio = (await barcos.mercado?.(puerto, fecha).catch(() => ({}))) ?? {};
      return { ...propio, programadas: programadasDe(magyp, puerto), ...(camiones ? { camiones } : {}) };
    },
    origen: `${barcos.origen ?? 'barcos'} + MAGyP ${magyp.desde}`,
    magyp,
  };
}
