// Dominio Barcos (independiente: no conoce precios, venta ni cadetes). API pública.
//
// Entrega:
//   - disponibilidad diaria de barcos (P(barco), barcos en puerto, capacidad, calado)
//   - señal por día para otros módulos (espera si llego ese día, índice de demanda, factor de precio)
//   - índices de mercado con datos publicados (demanda/oferta, saturación, Paraná)
//   - avisos propios (bajante, poca disponibilidad, perder barco, baja confianza)
// Las fuentes (NABSA, BCR, CSV manual, simulado) son adaptadores en infrastructure/barcos.
export { PUERTOS, PARAMS_DEFAULT, BARCOS_SEMANA_BASE, ESTACIONALIDAD } from './datos.js';
export { validarBarco, ESTADOS_BARCO } from './lineup.js';
export { factorCalado } from './calado.js';
export { aCalendarioDeCarga, calendarioDelPuerto, puertoDeTerminal } from './calendario.js';
export {
  predecirDisponibilidad,
  esperaEsperada,
  riesgoPerderBarco,
  senalPorDia,
  avisosBarcos,
  ordenar,
} from './colaBuques.js';
export { calcularIndicesMercado, demandaDiariaBarcos, PARAMS_INDICES, SOJA_POR_T_HARINA } from './indicesMercado.js';

import { predecirDisponibilidad, senalPorDia, avisosBarcos } from './colaBuques.js';

// Todo lo que los demás necesitan saber de los barcos, a partir de un line-up ya cargado.
export function analizarBarcos({ lineup = [], puerto, cultivo, hoy, horizonteDias = 60, nivelParanaM = null, params = {} }) {
  const disponibilidad = predecirDisponibilidad({ lineup, puerto, cultivo, hoy, horizonteDias, nivelParanaM, params });
  return {
    puerto,
    cultivo,
    hoy: disponibilidad.hoy,
    calado: disponibilidad.calado,
    disponibilidad,
    senal: senalPorDia(disponibilidad, params),
    avisos: avisosBarcos({ disponibilidad, params }),
  };
}
