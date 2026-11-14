import { evaluarRiesgoSilobolsa } from '../../domain/silobolsa/riesgoSilobolsa.js';

export function evaluarSilobolsa({ humedad = 14, temperatura = 20, mesesGuardado = 0 } = {}) {
  return evaluarRiesgoSilobolsa({ humedad, temperatura, mesesGuardado });
}

export default evaluarSilobolsa;
