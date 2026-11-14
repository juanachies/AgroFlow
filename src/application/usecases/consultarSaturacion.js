// Caso de uso: pronóstico de saturación de un puerto (barcos + camiones reservados en el marketplace).
// Lo usan simularPlan y la API (GET /api/saturacion).

import { analizarBarcos, puertoDeTerminal } from '../../domain/barcos/index.js';
import { pronosticarSaturacion } from '../../domain/saturacion/index.js';
import { sumarDias } from '../../domain/shared/util.js';

export const HORIZONTE_SATURACION_DIAS = 60;

/**
 * @param {{ barcos: import('../ports/BarcosPort.js').BarcosPort,
 *           marketplace: import('../ports/MarketplacePort.js').MarketplacePort,
 *           nivelRio?: import('../ports/NivelRioPort.js').NivelRioPort }} dependencias
 */
export function crearConsultarSaturacion({ barcos, marketplace, nivelRio = null }) {
  return async function consultarSaturacion({ puerto, cultivo, hoy, nivelParanaM = null, camionesPublicadosDia = null, params = undefined }) {
    if (!hoy) throw new RangeError('falta la fecha hoy');
    if (!cultivo) throw new RangeError('falta el cultivo');
    const clave = puertoDeTerminal(puerto ?? 'gran-rosario');
    const hasta = sumarDias(hoy, HORIZONTE_SATURACION_DIAS);
    const nivel = nivelParanaM ?? (nivelRio ? await nivelRio.nivel(hoy).catch(() => null) : null);
    const lineup = await barcos.calendario(clave, hoy, hasta);
    const analisis = analizarBarcos({ lineup, puerto: clave, cultivo, hoy, horizonteDias: HORIZONTE_SATURACION_DIAS, nivelParanaM: nivel });
    const reservas = await marketplace.reservas({ puerto: clave, desde: hoy, hasta });
    const pronostico = pronosticarSaturacion({ barcos: analisis, reservas, camionesPublicadosDia, params });
    return { ...pronostico, calado: analisis.calado, avisosBarcos: analisis.avisos, fuente: barcos.origen ?? null };
  };
}
