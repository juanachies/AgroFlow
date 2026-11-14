// Orquestador: Barcos -> Venta (vender o silobolsa, hasta dónde rinde) -> Cadetes.
// Cada módulo es independiente; este archivo solo los encadena y junta los avisos.
import { analizarBarcos, avisosBarcos, ordenar } from './barcos/index.js';
import { decidirVenta } from './venta/index.js';
import { avisoCadetes } from './cadetes/index.js';

export function planificar({
  lineup = [], puerto, cultivo, hoy, fechaGranoListo, diasCosecha = 7, toneladas,
  distanciaPuertoKm, distanciaAcopioKm = null, nivelParanaM = null, barcoContratado = null,
  precios = {}, supuestos = {}, paramsBarcos = {}, logistica = {}, horizonteDias = 60,
  mercado = {}, umbrales = {}, // datos publicados (NABSA/BCR) y umbrales de los índices del puerto
}) {
  // 1. Barcos (independiente)
  const barcos = analizarBarcos({ lineup, puerto, cultivo, hoy, horizonteDias, nivelParanaM, params: paramsBarcos });
  // 2. Venta: usa la señal de barcos y exige los índices del puerto para vender ahí
  const venta = decidirVenta({ barcos, cultivo, toneladas, fechaGranoListo, distanciaPuertoKm, distanciaAcopioKm, precios, supuestos, logistica, mercado, nivelParanaM, umbrales });
  // 3. Cadetes: según la decisión
  const cadetes = venta.decision
    ? avisoCadetes({ venta, toneladas, fechaGranoListo, diasCosecha, distanciaPuertoKm, distanciaAcopioKm, hoy: barcos.hoy, logistica })
    : null;

  // Avisos de barcos: los de la llegada al puerto solo si se vende al puerto; la bajante siempre.
  const llegadaPuerto = venta.canal === 'puerto' ? venta.mejorVenta.llegada : null;
  const avisosDeBarcos = avisosBarcos({ disponibilidad: barcos.disponibilidad, fechaLlegada: llegadaPuerto, barcoContratado: llegadaPuerto ? barcoContratado : null, params: paramsBarcos });

  return {
    barcos,
    venta,
    cadetes,
    avisos: ordenar([...venta.avisos, ...(cadetes ? [cadetes.aviso] : []), ...avisosDeBarcos]),
  };
}
