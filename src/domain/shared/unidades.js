export const QQ_POR_TON = 10;

export function qqHaToTonHa(qqHa) {
  return Number((qqHa * 0.1).toFixed(4));
}

export function tonHaToQqHa(tonHa) {
  return Number((tonHa / 0.1).toFixed(4));
}

export function toneladasDesdeRindeHectareas(rindeQqHa, hectareas) {
  if (!Number.isFinite(rindeQqHa) || !Number.isFinite(hectareas)) {
    throw new TypeError('rindeQqHa y hectareas deben ser numéricos');
  }

  return Number((rindeQqHa * 0.1 * hectareas).toFixed(4));
}

export function convertirUsdPorTonAUsdPorQq(precioUsdTon) {
  return Number((precioUsdTon / QQ_POR_TON).toFixed(4));
}

export function redondear(numero, decimales = 2) {
  const factor = 10 ** decimales;
  return Math.round((numero + Number.EPSILON) * factor) / factor;
}

export default {
  QQ_POR_TON,
  qqHaToTonHa,
  tonHaToQqHa,
  toneladasDesdeRindeHectareas,
  convertirUsdPorTonAUsdPorQq,
  redondear,
};
