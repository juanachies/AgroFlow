// Resumen de una simulación para explicarla (dominio puro).
//
// La IA no calcula: recibe solo estos números, que salen del motor determinista. El mismo resumen
// alimenta la explicación de respaldo (plantilla) cuando la IA no está disponible.

const redondear = (n) => (n == null ? null : Math.round(n));

export function resumirSimulacion(r) {
  const rec = r.plan.recomendado;
  const saturados = r.saturacion?.diasSaturados ?? [];
  return {
    lote: r.lote?.id ?? null,
    hoy: r.entrada?.hoy ?? null,
    toneladas: redondear(r.plan.toneladas),
    destino: {
      recomendado: rec.destino,
      tipo: rec.tipo,
      criterio: rec.criterio,
      margenUsd: redondear(rec.margen_usd),
      alternativas: (r.plan.alternativas ?? []).map((a) => ({ destino: a.destino, tipo: a.tipo, margenUsd: redondear(a.margen_usd) })),
    },
    puerto: r.puerto
      ? {
        puerto: r.puerto,
        diasSaturados: saturados.length,
        primerDiaSaturado: saturados[0] ?? null,
        ultimoDiaSaturado: saturados.at(-1) ?? null,
      }
      : null,
    despacho: r.ventana
      ? {
        inicio: r.ventana.inicio,
        fin: r.ventana.fin,
        corrimientoDias: r.ventana.desplazamientoDias,
        diasSaturadosEvitados: (r.ventana.diasSaturadosOriginal ?? 0) - (r.ventana.diasSaturados ?? 0),
      }
      : null,
    pedido: rec.pedidos.map((p) => ({ recurso: p.recurso, cantidad: p.cantidad, pedirAntesDel: p.pedir_antes_del, desde: p.usar_desde, hasta: p.usar_hasta })),
    marketplace: {
      coberturaPct: r.asignacion.coberturaPct,
      costoUsd: redondear(r.asignacion.costoUsd),
      proveedores: [...new Set(r.asignacion.lineas.flatMap((l) => l.asignaciones.map((a) => a.proveedor)))].length,
      faltantes: r.asignacion.faltantes.map((f) => `${f.faltan} ${f.recurso}`),
    },
    clima: r.clima ?? null,
    avisos: r.avisos.map((a) => ({ nivel: a.nivel, mensaje: a.mensaje })),
  };
}

// Diferencias entre la simulación base y un escenario, para explicar "¿y si…?".
export function compararSimulaciones(base, escenario) {
  const a = resumirSimulacion(base);
  const b = resumirSimulacion(escenario);
  const pedidoDe = (r, recurso) => r.pedido.find((p) => p.recurso === recurso);
  const cambios = [];
  if (a.destino.recomendado !== b.destino.recomendado) cambios.push(`el destino recomendado pasa de ${a.destino.recomendado} a ${b.destino.recomendado}`);
  if (a.destino.margenUsd != null && b.destino.margenUsd != null && a.destino.margenUsd !== b.destino.margenUsd) {
    cambios.push(`el margen del destino recomendado pasa de US$ ${a.destino.margenUsd} a US$ ${b.destino.margenUsd}`);
  }
  for (const recurso of ['cosechadora', 'camión', 'embolsadora']) {
    const pa = pedidoDe(a, recurso);
    const pb = pedidoDe(b, recurso);
    if (pa && pb && pa.cantidad !== pb.cantidad) cambios.push(`${recurso}: de ${pa.cantidad} a ${pb.cantidad}`);
    if (!pa && pb) cambios.push(`hace falta ${recurso} (${pb.cantidad})`);
    if (pa && !pb) cambios.push(`ya no hace falta ${recurso}`);
  }
  if ((a.despacho?.inicio ?? null) !== (b.despacho?.inicio ?? null)) cambios.push(`el despacho pasa a empezar el ${b.despacho?.inicio ?? '—'} (antes ${a.despacho?.inicio ?? '—'})`);
  if ((a.puerto?.diasSaturados ?? 0) !== (b.puerto?.diasSaturados ?? 0)) cambios.push(`días saturados en el puerto: de ${a.puerto?.diasSaturados ?? 0} a ${b.puerto?.diasSaturados ?? 0}`);
  if (a.marketplace.coberturaPct !== b.marketplace.coberturaPct) cambios.push(`cobertura del marketplace: de ${a.marketplace.coberturaPct}% a ${b.marketplace.coberturaPct}%`);
  return { antes: a, despues: b, cambios };
}
