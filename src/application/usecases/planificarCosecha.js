import { serviciosPedidos } from '../../domain/destino/servicios.js';
import { resolverFechaInicio } from '../../domain/destino/servicios.js';
import { armarPedidos, costosPorServicio } from '../../domain/maquinaria/pedidos.js';

/**
 * Arma el plan de pedido: qué contratar (cosecha y, si se piden, transporte y almacenaje),
 * cuánto, cuándo y a qué costo.
 * @param {{
 *   tarifas: import('../ports/TarifasPort.js').TarifasPort,
 *   compararDestinos: ReturnType<typeof import('./compararDestinos.js').crearCompararDestinos>,
 * }} dependencias
 */
export function crearPlanificarCosecha({ tarifas, compararDestinos }) {
  return async function planificarCosecha(original) {
    const entrada = resolverFechaInicio(original);
    const { evaluados, mejor, criterio } = await compararDestinos(entrada);
    const vigentes = await tarifas.vigentes();
    const pedidos = armarPedidos(mejor.resultado, entrada.fechaInicioCosecha, vigentes);
    return {
      servicios: serviciosPedidos(entrada),
      toneladas: mejor.resultado.toneladas,
      urgencia: entrada.urgencia,
      dias_efectivos: mejor.resultado.dias_efectivos,
      recomendado: {
        destino: mejor.destino,
        tipo: mejor.tipo,
        criterio,
        costo_usd: mejor.costo_usd,
        costo_extraccion_usd: mejor.costo_extraccion_usd,
        margen_usd: mejor.margen_usd,
        costos_por_servicio: costosPorServicio(pedidos),
        pedidos,
      },
      alternativas: evaluados.map((evaluado) => ({
        destino: evaluado.destino,
        tipo: evaluado.tipo,
        costo_usd: evaluado.costo_usd,
        margen_usd: evaluado.margen_usd,
        ingreso_usd: evaluado.ingreso_usd,
        costo_extraccion_usd: evaluado.costo_extraccion_usd,
        costos_por_servicio: costosPorServicio(armarPedidos(evaluado.resultado, entrada.fechaInicioCosecha, vigentes)),
        distancia_km: evaluado.resultado.distancia_km ?? null,
      })),
    };
  };
}
