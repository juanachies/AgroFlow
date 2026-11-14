// Parsers de tablas de la Bolsa de Comercio de Rosario (sección Información Comercial).
//
// 1. "Buques a la carga" (carga en buques programada, fuente NABSA):
//    https://www.bcr.com.ar/es/mercados/mercado-de-granos/informacion-comercial/informacion-comercial
//    Excel diario: https://www.bcr.com.ar/sites/default/files/AAAA-MM/buques_AAAAMMDD.xls
//    Columnas: Producto | ROS / SL | NECOCHEA | BAHIA BLANCA | Otros puertos | Total (t)
// 2. "Posición de Camiones" (ingreso de camiones a zona portuaria de Rosario, Up-River):
//    Excel diario: https://www.bcr.com.ar/sites/default/files/AAAA-MM/AAAAMMDD.xlsx
//    Columnas: Producto | camiones del día | ... (fuente: BCR en base a CECOA)
//
// Los parsers reciben el texto copiado de la tabla (o exportado a CSV desde el Excel):
// columnas separadas por tabulador, ';', ',' o 2+ espacios; números con punto de miles.
// Los signos +, -, = que muestra la web entre celdas se ignoran.

const PRODUCTOS = {
  trigo: 'trigo',
  maiz: 'maiz',
  'maíz': 'maiz',
  soja: 'soja',
  harinas: 'harinas',
  aceites: 'aceites',
  cebada: 'cebada',
  sorgo: 'sorgo',
  girasol: 'girasol',
  otros: 'otros',
  total: 'total',
};

const COLUMNAS_BUQUES = ['gran-rosario', 'quequen', 'bahia-blanca', 'otros', 'total'];

function normalizar(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function celdas(linea) {
  return linea
    .split(/\t|;|\s{2,}|,(?=\s*[\d-])/)
    .map((c) => c.trim())
    .filter((c) => c && !/^[+\-=]$/.test(c));
}

function aNumero(c) {
  const limpio = c.replace(/[+=\s]/g, '').replace(/\./g, '').replace(',', '.');
  return limpio === '' || limpio === '-' ? 0 : Number(limpio);
}

function filasDeProductos(texto) {
  const filas = [];
  for (const linea of String(texto).split(/\r?\n/)) {
    const cs = celdas(linea);
    if (cs.length < 2) continue;
    const prod = PRODUCTOS[normalizar(cs[0])];
    if (!prod) continue;
    const nums = cs.slice(1).map(aNumero).filter((n) => Number.isFinite(n));
    filas.push({ producto: prod, nums });
  }
  return filas;
}

function periodo(texto) {
  const m = String(texto).match(/del:?\s*(\d{2})\/(\d{2})\/(\d{4})\s*al:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  return { desde: `${m[3]}-${m[2]}-${m[1]}`, hasta: `${m[6]}-${m[5]}-${m[4]}` };
}

// Devuelve { desde, hasta, porPuerto: { 'gran-rosario': { trigo, maiz, soja, harinas, aceites, ... }, ... } }
export function parsearBuquesBCR(texto, { desde, hasta } = {}) {
  const p = periodo(texto) ?? { desde, hasta };
  const porPuerto = Object.fromEntries(COLUMNAS_BUQUES.map((c) => [c, {}]));
  for (const { producto, nums } of filasDeProductos(texto)) {
    if (nums.length < 5) continue;
    COLUMNAS_BUQUES.forEach((col, i) => (porPuerto[col][producto] = nums[i]));
  }
  if (!Object.keys(porPuerto.total).length) throw new Error('No se reconocieron filas de productos en la tabla "Buques a la carga"');
  return { fuente: 'BCR / NABSA', desde: p.desde ?? null, hasta: p.hasta ?? null, porPuerto };
}

// Devuelve { fecha, camiones: { soja, maiz, trigo, ..., total } } tomando la primera columna numérica (día).
export function parsearCamionesBCR(texto, { fecha } = {}) {
  const m = String(texto).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  const f = fecha ?? (m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : null);
  const camiones = {};
  for (const { producto, nums } of filasDeProductos(texto)) {
    if (nums.length) camiones[producto] = nums[0];
  }
  if (!Object.keys(camiones).length) throw new Error('No se reconocieron filas de productos en la tabla de camiones');
  return { fuente: 'BCR / CECOA', fecha: f, camiones };
}
