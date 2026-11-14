// Caso de uso: decidir la venta durante la cosecha según los barcos (módulo 5).
//
//   Barcos (dominio) -> Venta: índices del puerto, vender a puerto / acopio o silobolsa,
//   hasta dónde rinde -> Cadetes: qué pedir, cuánto, cuándo y adónde.
//
// Puertos: BarcosPort (line-up y datos de mercado), NivelRioPort (altura del Paraná) y PreciosPort
// (spot y futuros: reemplazan los precios supuestos y la silobolsa se evalúa mes a mes).
// Si el adaptador de barcos falla y hay un respaldo (simulado), se usa el respaldo y se informa.

import { analizarBarcos, avisosBarcos, ordenar } from '../../domain/barcos/index.js';
import { decidirVentaCosecha, curvaDesdePrecios } from '../../domain/venta/index.js';
import { avisoCadetes } from '../../domain/maquinaria/cadetes.js';
import { sumarDias } from '../../domain/shared/util.js';

// Composición pura de los tres pasos, con los datos ya cargados.
export function planificarVentaCosecha({
  lineup = [], puerto, cultivo, hoy, fechaGranoListo, diasCosecha = 7, toneladas,
  distanciaPuertoKm, distanciaAcopioKm = null, nivelParanaM = null, barcoContratado = null,
  precios = {}, supuestos = {}, paramsBarcos = {}, logistica = {}, horizonteDias = 60,
  mercado = {}, umbrales = {}, curvaPrecios = null, mesesMaxSilobolsa = 6,
}) {
  // 1. Barcos (independiente)
  const barcos = analizarBarcos({ lineup, puerto, cultivo, hoy, horizonteDias, nivelParanaM, params: paramsBarcos });
  // 2. Venta: usa la señal de barcos y exige los índices del puerto para vender ahí
  const venta = decidirVentaCosecha({ barcos, cultivo, toneladas, fechaGranoListo, distanciaPuertoKm, distanciaAcopioKm, precios, supuestos, logistica, mercado, nivelParanaM, umbrales, curvaPrecios, mesesMaxSilobolsa });
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

/**
 * @param {{ barcos: import('../ports/BarcosPort.js').BarcosPort,
 *           nivelRio?: import('../ports/NivelRioPort.js').NivelRioPort,
 *           respaldoBarcos?: import('../ports/BarcosPort.js').BarcosPort,
 *           precios?: import('../ports/PreciosPort.js').PreciosPort }} puertos
 */
export function crearDecidirVentaCosecha({ barcos, nivelRio = null, respaldoBarcos = null, precios = null }) {
  return async function decidirVentaCosechaCasoDeUso(entrada) {
    const { puerto, hoy, horizonteDias = 60 } = entrada;
    const hasta = sumarDias(hoy, horizonteDias);
    let fuente = barcos;
    let lineup;
    try {
      lineup = await barcos.calendario(puerto, hoy, hasta);
    } catch (error) {
      if (!respaldoBarcos) throw error;
      fuente = respaldoBarcos;
      lineup = await respaldoBarcos.calendario(puerto, hoy, hasta);
    }
    const mercadoPublicado = (await fuente.mercado?.(puerto, hoy).catch(() => ({}))) ?? {};
    const nivelParanaM = entrada.nivelParanaM ?? (nivelRio ? await nivelRio.nivel(hoy).catch(() => null) : null);
    // Spot y futuros (PreciosPort): el spot real reemplaza al supuesto y la silobolsa se evalúa
    // mes a mes con la curva de futuros.
    let curvaPrecios = null;
    let fuentePrecios = 'supuestos';
    if (precios) {
      try {
        curvaPrecios = curvaDesdePrecios(hoy, await precios.precios(entrada.cultivo));
        fuentePrecios = curvaPrecios.fuente ?? precios.origen ?? 'PreciosPort';
      } catch {
        fuentePrecios = 'supuestos (falló PreciosPort)';
      }
    }
    const resultado = planificarVentaCosecha({ ...entrada, lineup, nivelParanaM, curvaPrecios, mercado: { ...mercadoPublicado, ...entrada.mercado } });
    return {
      ...resultado,
      fuentes: {
        barcos: `${fuente.origen ?? 'adaptador de barcos'}${fuente === respaldoBarcos ? ' (respaldo)' : ''}`,
        nivelParana: nivelParanaM == null ? 'sin dato' : entrada.nivelParanaM != null ? 'cargado por el usuario' : 'NivelRioPort',
        precios: fuentePrecios,
      },
    };
  };
}
