// "Barcos del puerto" como entrada de Elegir destino (compararDestinos).
//
// Para cada destino de tipo puerto, con la señal del módulo Barcos en la fecha en que llegaría el grano:
//   - precio del puerto × factor de precio por demanda de barcos;
//   - costo adicional + espera esperada hasta tener barco × costo de espera (USD/t/día);
//   - índices a cumplir para vender a puerto (demanda ÷ oferta, espera, saturación, demanda de
//     barcos, Paraná). Si no cumple, el destino queda `habilitado: false` y Elegir destino lo descarta.
// Los destinos de acopio y silobolsa no cambian.

import { calcularIndicesMercado } from '../barcos/indicesMercado.js';
import { evaluarIndicesPuerto } from '../venta/criterios.js';
import { SUPUESTOS_VENTA } from '../venta/supuestos.js';
import { redondear } from '../shared/util.js';

/**
 * @param {{ destino:object, barcos:object, fechaLlegada:string, cultivo:string, mercado?:object,
 *           nivelParanaM?:number|null, umbrales?:object, costoEsperaUsdPorTDia?:number }} entrada
 *   barcos: salida de analizarBarcos() para el puerto del destino.
 */
export function ajustarDestinoPuerto({ destino, barcos, fechaLlegada, cultivo, mercado = {}, nivelParanaM = null, umbrales = {}, costoEsperaUsdPorTDia = SUPUESTOS_VENTA.costoEsperaUSDtDia }) {
  if (destino?.tipo !== 'puerto') return destino;
  const senal = barcos.senal.find((s) => s.fecha === fechaLlegada) ?? null;
  const indices = calcularIndicesMercado({ cultivo, puerto: barcos.puerto, programadas: mercado.programadas, camiones: mercado.camiones, nivelParanaM, senalLlegada: senal });
  const indicesPuerto = evaluarIndicesPuerto(indices, umbrales);
  const espera = senal?.esperaDias ?? 0;
  const factor = senal?.factorPrecio ?? 1;
  return {
    ...destino,
    precioUsdPorT: destino.precioUsdPorT == null ? null : redondear(destino.precioUsdPorT * factor, 2),
    costoAdicionalUsdPorT: redondear((destino.costoAdicionalUsdPorT ?? 0) + espera * costoEsperaUsdPorTDia, 2),
    habilitado: indicesPuerto.cumple,
    barcos: {
      puerto: barcos.puerto,
      fechaLlegada,
      probBarco: senal?.probBarcoEnTolerancia ?? null,
      esperaDias: espera,
      indiceDemanda: senal?.indiceDemanda ?? null,
      factorPrecio: factor,
      fuente: senal?.fuente ?? 'fuera del horizonte',
      indicesPuerto,
    },
  };
}
