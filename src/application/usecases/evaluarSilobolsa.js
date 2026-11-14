import { evaluarRiesgo } from '../../domain/silobolsa/riesgoSilobolsa.js';

/**
 * Lee el silobolsa y su serie del IoT y calcula el riesgo.
 * @param {{ silobolsas: import('../ports/SilobolsasPort.js').SilobolsasPort,
 *   lecturasIot: import('../ports/LecturasIotPort.js').LecturasIotPort,
 *   tarifas: import('../ports/TarifasPort.js').TarifasPort }} puertos
 */
export function crearEvaluarSilobolsa({ silobolsas, lecturasIot, tarifas }) {
  return async function evaluarSilobolsa(silobolsaId) {
    const [silobolsa, lecturas, vigentes] = await Promise.all([
      silobolsas.obtener(silobolsaId),
      lecturasIot.lecturas(silobolsaId),
      tarifas.vigentes(),
    ]);
    return { silobolsa, riesgo: evaluarRiesgo({ cultivo: silobolsa.cultivo, lecturas }, vigentes) };
  };
}
