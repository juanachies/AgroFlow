import { dimensionarCosecha } from '../maquinaria/dimensionarCosecha.js';

export function evaluarDestino(entrada, destino, tarifas) {
  const resultado = dimensionarCosecha(
    {
      ha: entrada.ha,
      qqHa: entrada.qqHa,
      cultivo: entrada.cultivo,
      diasDisponibles: entrada.diasDisponibles,
      urgencia: entrada.urgencia,
      destino: destino?.tipo,
      distanciaKm: destino?.distanciaKm,
    },
    tarifas,
  );
  const extraccion = resultado.silobolsa?.costo_extraccion_usd ?? 0;
  const adicional = resultado.toneladas * (destino?.costoAdicionalUsdPorT ?? 0);
  const costo = resultado.costo_total_usd + extraccion + adicional;
  const ingreso = destino?.precioUsdPorT == null ? null : resultado.toneladas * destino.precioUsdPorT;
  return {
    destino: destino ? (destino.nombre ?? destino.tipo) : null,
    tipo: destino?.tipo ?? null,
    costo_usd: costo,
    costo_extraccion_usd: extraccion,
    ingreso_usd: ingreso,
    margen_usd: ingreso == null ? null : ingreso - costo,
    resultado,
  };
}

export function elegirDestino(evaluados) {
  if (evaluados.length === 1) return { mejor: evaluados[0], criterio: 'único destino evaluado' };
  const conPrecio = evaluados.every((e) => e.margen_usd != null);
  const orden = conPrecio ? (a, b) => b.margen_usd - a.margen_usd : (a, b) => a.costo_usd - b.costo_usd;
  return {
    mejor: [...evaluados].sort(orden)[0],
    criterio: conPrecio ? 'mayor margen neto' : 'menor costo logístico (faltan precios para calcular margen)',
  };
}
