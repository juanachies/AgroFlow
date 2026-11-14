const datos = require('../datos/maquinaria.json');
const { dimensionarCosecha } = require('./dimensionar');

const CAMPOS_REQUERIDOS = ['ha', 'qqHa', 'cultivo', 'diasDisponibles', 'urgencia', 'fechaInicioCosecha', 'destinos'];
const MS_POR_DIA = 86400000;

function datosFaltantes(entrada) {
  const faltan = CAMPOS_REQUERIDOS.filter((campo) => entrada[campo] == null || entrada[campo] === '');
  const destinos = Array.isArray(entrada.destinos) ? entrada.destinos : [];
  if (entrada.destinos != null && destinos.length === 0) faltan.push('destinos (al menos uno)');
  destinos.forEach((destino, i) => {
    if (!destino.tipo) faltan.push(`destinos[${i}].tipo`);
    if (destino.tipo !== 'silobolsa' && destino.distanciaKm == null) faltan.push(`destinos[${i}].distanciaKm`);
  });
  return faltan;
}

function sumarDias(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new RangeError(`fecha inválida: ${fechaIso}`);
  return new Date(fecha.getTime() + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

function lineaPedido(recurso, tipo, cantidad, inicio, anticipo, diasUso, costoUsd, extra = {}) {
  return {
    recurso,
    tipo,
    cantidad,
    pedir_antes_del: sumarDias(inicio, -anticipo),
    usar_desde: inicio,
    usar_hasta: sumarDias(inicio, diasUso - 1),
    costo_usd: costoUsd,
    ...extra,
  };
}

function armarPedidos(r, inicio, d) {
  const anticipo = d.reserva.anticipo_dias;
  const diasCosecha = r.cosechadoras.dias;
  const pedidos = [
    lineaPedido('cosechadora', r.cosechadoras.id, r.cosechadoras.cantidad, inicio, anticipo.cosechadora, diasCosecha, r.cosechadoras.costo_usd),
    lineaPedido('tractor con tolva', `tolva de ${r.tractores.capacidad_t} t`, r.tractores.cantidad, inicio, anticipo.tractor_tolva, diasCosecha, r.tractores.costo_usd),
  ];
  if (r.camiones) {
    const camion = r.camiones.elegido;
    pedidos.push(
      lineaPedido('camión', camion.id, camion.cantidad, inicio, anticipo.camion, diasCosecha, camion.costo_usd, {
        modalidad: camion.modalidad,
        viajes_por_dia: camion.viajes_por_dia,
      }),
    );
  }
  if (r.silobolsa) {
    const { embolsadora, bolsas, costo_embolsado_usd: costo } = r.silobolsa;
    pedidos.push(
      lineaPedido('embolsadora', embolsadora.id, embolsadora.cantidad, inicio, anticipo.embolsadora, embolsadora.dias, 0),
      lineaPedido('silobolsa', 'bolsa 9 pies x 60 m', bolsas, inicio, anticipo.silobolsa, embolsadora.dias, costo),
    );
  }
  return pedidos;
}

function evaluarDestino(entrada, destino, d) {
  const resultado = dimensionarCosecha(
    {
      ha: entrada.ha,
      qqHa: entrada.qqHa,
      cultivo: entrada.cultivo,
      diasDisponibles: entrada.diasDisponibles,
      urgencia: entrada.urgencia,
      destino: destino.tipo,
      distanciaKm: destino.distanciaKm,
    },
    d,
  );
  const extraccion = resultado.silobolsa ? resultado.silobolsa.costo_extraccion_usd : 0;
  const adicional = resultado.toneladas * (destino.costoAdicionalUsdPorT ?? 0);
  const costo = resultado.costo_total_usd + extraccion + adicional;
  const ingreso = destino.precioUsdPorT == null ? null : resultado.toneladas * destino.precioUsdPorT;
  return {
    destino: destino.nombre ?? destino.tipo,
    tipo: destino.tipo,
    costo_usd: costo,
    ingreso_usd: ingreso,
    margen_usd: ingreso == null ? null : ingreso - costo,
    resultado,
  };
}

function elegirDestino(evaluados) {
  const conPrecio = evaluados.every((e) => e.margen_usd != null);
  const mejor = [...evaluados].sort((a, b) => (conPrecio ? b.margen_usd - a.margen_usd : a.costo_usd - b.costo_usd))[0];
  return { mejor, criterio: conPrecio ? 'mayor margen neto' : 'menor costo logístico (faltan precios para calcular margen)' };
}

function planDePedido(entrada, d = datos) {
  const faltan = datosFaltantes(entrada);
  if (faltan.length > 0) throw new RangeError(`faltan datos: ${faltan.join(', ')}`);

  const evaluados = entrada.destinos.map((destino) => evaluarDestino(entrada, destino, d));
  const { mejor, criterio } = elegirDestino(evaluados);
  return {
    toneladas: mejor.resultado.toneladas,
    urgencia: entrada.urgencia,
    dias_efectivos: mejor.resultado.dias_efectivos,
    recomendado: {
      destino: mejor.destino,
      tipo: mejor.tipo,
      criterio,
      costo_usd: mejor.costo_usd,
      margen_usd: mejor.margen_usd,
      pedidos: armarPedidos(mejor.resultado, entrada.fechaInicioCosecha, d),
    },
    alternativas: evaluados.map(({ destino, tipo, costo_usd, margen_usd }) => ({ destino, tipo, costo_usd, margen_usd })),
  };
}

module.exports = { planDePedido, datosFaltantes };
