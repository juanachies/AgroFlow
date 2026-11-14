const MIN_PUNTOS_TABLA = 900;

// El PDF de CATAC usa una fuente propia: cada dígito sale como un glifo distinto.
const GLIFOS = { Ǩ: '0', ǩ: '1', Ǫ: '2', ǫ: '3', Ǭ: '4', ǭ: '5', Ǯ: '6', ǯ: '7', ǰ: '8', Ǳ: '9', Ȯ: '.', ȯ: ',' };

export function decodificarGlifos(texto) {
  return [...texto].map((c) => GLIFOS[c] ?? c).join('');
}

function parsearPrecio(texto) {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function validarTablaCatac(tabla) {
  if (tabla.length < MIN_PUNTOS_TABLA) {
    throw new Error(`tabla CATAC incompleta: ${tabla.length} puntos, se esperaban al menos ${MIN_PUNTOS_TABLA}`);
  }
  const creciente = tabla.every((p, i) => i === 0 || p.ars >= tabla[i - 1].ars);
  if (!creciente) throw new Error('tabla CATAC inconsistente: las tarifas no crecen con los km');
}

export function parsearTablaCatac(textoPdf) {
  const pares = decodificarGlifos(textoPdf).matchAll(
    /(?<![\d.,])(\d{1,3}(?:\.\d{3})?)[ \t]+(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d.,])/g,
  );
  const porKm = new Map();
  for (const [, km, precio] of pares) porKm.set(Number(km.replace('.', '')), parsearPrecio(precio));
  const tabla = [...porKm].map(([km, ars]) => ({ km, ars })).sort((a, b) => a.km - b.km);
  validarTablaCatac(tabla);
  return tabla;
}

export function parsearEstadiaCatac(textoPdf) {
  const coincidencia = decodificarGlifos(textoPdf).match(/estad[ií]a:\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return coincidencia ? parsearPrecio(coincidencia[1]) : null;
}
