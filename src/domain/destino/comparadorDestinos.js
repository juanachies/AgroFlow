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
    habilitado: destino?.habilitado !== false,
    ...(destino?.barcos ? { barcos: destino.barcos } : {}),
    resultado,
  };
}

// Los puertos que no cumplen los índices de barcos (habilitado: false) se descartan,
// salvo que no quede ningún otro destino.
export function elegirDestino(evaluados) {
  const habilitados = evaluados.filter((e) => e.habilitado !== false);
  const descartados = evaluados.filter((e) => e.habilitado === false).map((e) => e.destino);
  const candidatos = habilitados.length > 0 ? habilitados : evaluados;
  const nota = descartados.length > 0 && habilitados.length > 0 ? `; puerto descartado por índices de barcos: ${descartados.join(', ')}` : '';
  if (candidatos.length === 1) return { mejor: candidatos[0], criterio: `único destino evaluado${nota}`, descartados };
  const conPrecio = candidatos.every((e) => e.margen_usd != null);
  const orden = conPrecio ? (a, b) => b.margen_usd - a.margen_usd : (a, b) => a.costo_usd - b.costo_usd;
  return {
    mejor: [...candidatos].sort(orden)[0],
    criterio: `${conPrecio ? 'mayor margen neto' : 'menor costo logístico (faltan precios para calcular margen)'}${nota}`,
    descartados,
  };
}
