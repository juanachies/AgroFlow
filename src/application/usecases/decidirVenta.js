import { sumarDias } from '../../domain/shared/fechas.js';
import { decidirVenta as decidir } from '../../domain/venta/decisionVenta.js';

const HORIZONTE_BARCOS_DIAS = 120;

/**
 * Decide en qué barco embarcar el silobolsa y cuándo cargar los fletes.
 * @param {{ evaluarSilobolsa: (id: string) => Promise<object>,
 *   precios: import('../ports/PreciosPort.js').PreciosPort,
 *   barcos: import('../ports/BarcosPort.js').BarcosPort,
 *   tarifas: import('../ports/TarifasPort.js').TarifasPort }} puertos
 */
export function crearDecidirVenta({ evaluarSilobolsa, precios, barcos, tarifas }) {
  return async function decidirVenta({ silobolsaId, hoy, destino, tasaAnual, acopios = destino?.acopios ?? [] }) {
    const { silobolsa, riesgo } = await evaluarSilobolsa(silobolsaId);
    const [precio, calendario, vigentes] = await Promise.all([
      precios.precios(silobolsa.cultivo),
      barcos.calendario(destino.terminal, hoy, sumarDias(hoy, HORIZONTE_BARCOS_DIAS)),
      tarifas.vigentes(),
    ]);
    // Solo barcos que cargan el cultivo de la bolsa (los que no informan cultivo sirven para todos).
    const delCultivo = calendario.filter((barco) => !barco.cultivo || barco.cultivo === silobolsa.cultivo);
    const decision = decidir({ silobolsa, riesgo, precio, barcos: delCultivo, destino, hoy, tasaAnual, acopios }, vigentes);
    return { silobolsaId, ...decision };
  };
}
