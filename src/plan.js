const datos = require('../datos/maquinaria.json');
const { dimensionarCosecha } = require('./dimensionar');

const SERVICIOS = ['cosecha', 'transporte', 'almacenaje'];
const SERVICIO_DEL_DESTINO = { puerto: 'transporte', acopio: 'transporte', silobolsa: 'almacenaje' };
const CAMPOS_REQUERIDOS = ['ha', 'qqHa', 'cultivo', 'diasDisponibles', 'urgencia', 'fechaInicioCosecha'];
const MS_POR_DIA = 86400000;

function serviciosPedidos(entrada) {
  return [...new Set(['cosecha', ...(entrada.servicios ?? [])])];
}

function serviciosConDestino(entrada) {
  const servicios = serviciosPedidos(entrada);
  return servicios.filter((s) => s !== 'cosecha');
}

function datosFaltantes(entrada) {
  const faltan = CAMPOS_REQUERIDOS.filter((campo) => entrada[campo] == null || entrada[campo] === '');
  const destinos = entrada.destinos ?? [];
  const necesarios = serviciosConDestino(entrada);
  if (necesarios.length > 0 && destinos.length === 0) faltan.push(`destinos (hace falta para ${necesarios.join(' y ')})`);
  destinos.forEach((destino, i) => {
    if (!destino.tipo) faltan.push(`destinos[${i}].tipo`);
    if (destino.tipo && destino.tipo !== 'silobolsa' && destino.distanciaKm == null) {
      faltan.push(`destinos[${i}].distanciaKm`);
    }
  });
  return faltan;
}

function validarServicios(entrada) {
  const servicios = serviciosPedidos(entrada);
  const invalido = servicios.find((s) => !SERVICIOS.includes(s));
  if (invalido) throw new RangeError(`servicio inválido: ${invalido}. Opciones: ${SERVICIOS.join(', ')}`);
  for (const destino of entrada.destinos ?? []) {
    const requerido = SERVICIO_DEL_DESTINO[destino.tipo];
    if (!requerido) throw new RangeError(`tipo de destino inválido: ${destino.tipo}`);
    if (!servicios.includes(requerido)) {
      throw new RangeError(`el destino "${destino.nombre ?? destino.tipo}" requiere pedir el servicio "${requerido}"`);
    }
  }
}

function sumarDias(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new RangeError(`fecha inválida: ${fechaIso}`);
  return new Date(fecha.getTime() + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

function lineaPedido(servicio, recurso, tipo, cantidad, inicio, anticipo, diasUso, costoUsd, extra = {}) {
  return {
    servicio,
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
    lineaPedido('cosecha', 'cosechadora', r.cosechadoras.id, r.cosechadoras.cantidad, inicio, anticipo.cosechadora, diasCosecha, r.cosechadoras.costo_usd),
    lineaPedido('cosecha', 'tractor con tolva', `tolva de ${r.tractores.capacidad_t} t`, r.tractores.cantidad, inicio, anticipo.tractor_tolva, diasCosecha, r.tractores.costo_usd),
  ];
  if (r.camiones) {
    const camion = r.camiones.elegido;
    pedidos.push(
      lineaPedido('transporte', 'camión', camion.id, camion.cantidad, inicio, anticipo.camion, diasCosecha, camion.costo_usd, {
        modalidad: camion.modalidad,
        viajes_por_dia: camion.viajes_por_dia,
      }),
    );
  }
  if (r.silobolsa) {
    const { embolsadora, bolsas, costo_embolsado_usd: costo } = r.silobolsa;
    pedidos.push(
      lineaPedido('almacenaje', 'embolsadora', embolsadora.id, embolsadora.cantidad, inicio, anticipo.embolsadora, embolsadora.dias, 0),
      lineaPedido('almacenaje', 'silobolsa', 'bolsa 9 pies x 60 m', bolsas, inicio, anticipo.silobolsa, embolsadora.dias, costo),
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
      destino: destino?.tipo,
      distanciaKm: destino?.distanciaKm,
    },
    d,
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

function elegirDestino(evaluados) {
  if (evaluados.length === 1) return { mejor: evaluados[0], criterio: 'único destino evaluado' };
  const conPrecio = evaluados.every((e) => e.margen_usd != null);
  const orden = conPrecio ? (a, b) => b.margen_usd - a.margen_usd : (a, b) => a.costo_usd - b.costo_usd;
  return {
    mejor: [...evaluados].sort(orden)[0],
    criterio: conPrecio ? 'mayor margen neto' : 'menor costo logístico (faltan precios para calcular margen)',
  };
}

function costosPorServicio(pedidos) {
  const totales = {};
  for (const { servicio, costo_usd: costo } of pedidos) totales[servicio] = (totales[servicio] ?? 0) + costo;
  return totales;
}

function planDePedido(entrada, d = datos) {
  const faltan = datosFaltantes(entrada);
  if (faltan.length > 0) throw new RangeError(`faltan datos: ${faltan.join(', ')}`);
  validarServicios(entrada);

  const candidatos = entrada.destinos?.length > 0 ? entrada.destinos : [null];
  const evaluados = candidatos.map((destino) => evaluarDestino(entrada, destino, d));
  const { mejor, criterio } = elegirDestino(evaluados);
  const pedidos = armarPedidos(mejor.resultado, entrada.fechaInicioCosecha, d);
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
    alternativas: evaluados.map(({ destino, tipo, costo_usd, margen_usd }) => ({ destino, tipo, costo_usd, margen_usd })),
  };
}

module.exports = { planDePedido, datosFaltantes };
