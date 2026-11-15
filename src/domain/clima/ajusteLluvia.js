// Días de cosecha que quedan después de descontar los días de lluvia del pronóstico (dominio puro).
// Supuesto editable: con 5 mm o más en el día no se cosecha (la regla de corte de caminos de
// corteCaminos.js es más exigente: 20 mm en 48 h).

import { sumarDias } from '../shared/util.js';

export const UMBRAL_LLUVIA_COSECHA_MM = 5;

/**
 * @param {{ diasDisponibles:number, desde:string, pronostico:{fecha:string, lluviaMm:number}[], umbralMm?:number }} entrada
 */
export function diasHabilesConLluvia({ diasDisponibles, desde, pronostico, umbralMm = UMBRAL_LLUVIA_COSECHA_MM }) {
  const hasta = sumarDias(desde, diasDisponibles - 1);
  const enVentana = pronostico.filter((d) => d.fecha >= desde && d.fecha <= hasta && Number.isFinite(d.lluviaMm));
  const lluviosos = enVentana.filter((d) => d.lluviaMm >= umbralMm).map((d) => d.fecha);
  return {
    diasDisponiblesOriginal: diasDisponibles,
    diasDisponibles: Math.max(1, diasDisponibles - lluviosos.length),
    diasConLluvia: lluviosos.length,
    diasLluviosos: lluviosos,
    diasCubiertos: enVentana.length,
    umbralMm,
  };
}
