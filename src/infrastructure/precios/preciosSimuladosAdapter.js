// Adaptador simulado de PreciosPort (respaldo): spot de los supuestos de Venta y una curva de
// futuros con carry mensual constante. No son precios de mercado.

import { PRECIOS_DEFAULT } from '../../domain/venta/supuestos.js';
import { sumarDias } from '../../domain/shared/util.js';

export function crearPreciosSimuladosAdapter({ hoy, carryMensualUSDt = 2, meses = 8 } = {}) {
  if (!hoy) throw new Error('crearPreciosSimuladosAdapter necesita `hoy` (las fechas entran como parámetro)');
  return {
    async precios(cultivo) {
      const ref = PRECIOS_DEFAULT[cultivo];
      if (!ref) throw new RangeError(`cultivo sin precio simulado: ${cultivo}`);
      const spot = ref.puertoHoyUSDt;
      const futuros = Array.from({ length: meses }, (_, i) => ({
        mes: sumarDias(hoy, 30 * (i + 1)).slice(0, 7),
        precio: spot + carryMensualUSDt * (i + 1),
      }));
      return { spot, futuros, fuente: 'simulado (supuestos)' };
    },
    origen: 'simulado',
  };
}
