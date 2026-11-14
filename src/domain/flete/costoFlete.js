import { exigirPositivo } from '../shared/errores.js';

function interpolar(tabla, km) {
  if (km <= tabla[0].km) return tabla[0].ars;
  const i = tabla.findIndex((punto) => punto.km >= km);
  const [a, b] = [tabla[i - 1], tabla[i]];
  return a.ars + ((km - a.km) / (b.km - a.km)) * (b.ars - a.ars);
}

export function tarifaFleteUsdPorT(km, tarifas) {
  exigirPositivo('distanciaKm', km);
  const tabla = tarifas.flete.tabla_ars_por_t;
  const ultimo = tabla[tabla.length - 1];
  if (km > ultimo.km) {
    throw new RangeError(`distanciaKm fuera de la tabla CATAC (máximo ${ultimo.km} km)`);
  }
  return (interpolar(tabla, km) * tarifas.flete.factor_actualizacion) / tarifas.parametros_generales.tipo_cambio_ars_usd;
}

export function estadiaUsdPorDia(tarifas) {
  return tarifas.flete.estadia_ars_por_dia / tarifas.parametros_generales.tipo_cambio_ars_usd;
}
